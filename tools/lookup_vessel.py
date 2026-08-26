#!/usr/bin/env python3
import argparse, json, re, time
from html import unescape
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

UA = "MarineDrift-NEREUS/1.7 (+https://github.com/Peter1993-NEREUS/VOLGA-4007-Drift-Model)"

def valid_imo(imo):
    return bool(re.fullmatch(r"\d{7}", imo)) and sum(int(imo[i])*(7-i) for i in range(6)) % 10 == int(imo[6])

def get(url, timeout=25):
    req=Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/json;q=0.9,*/*;q=0.8"})
    with urlopen(req,timeout=timeout) as r:return r.read().decode("utf-8","replace")

def clean(x):
    return re.sub(r"\s+"," ",unescape(str(x or ""))).strip()

def number(x):
    m=re.search(r"[-+]?\d+(?:[.,]\d+)?",str(x or ""));return float(m.group(0).replace(",",".")) if m else 0.0

def norm_name(x):return re.sub(r"[^A-Z0-9]","",str(x or "").upper())

def plausible(n,lo,hi):
    n=float(n or 0);return n if lo<=n<=hi else 0.0

def vessel_finder(imo):
    url=f"https://www.vesselfinder.com/vessels/details/{imo}";html=get(url)
    if "VesselFinder" not in html or len(html)<2000:raise RuntimeError("VesselFinder response unavailable")
    rows={}
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>",html,re.I|re.S):
        cells=[clean(re.sub(r"<[^>]+>"," ",c)) for c in re.findall(r"<(?:th|td)\b[^>]*>(.*?)</(?:th|td)>",tr,re.I|re.S)]
        cells=[c for c in cells if c]
        if len(cells)>=2:rows[cells[0].lower().rstrip(":")]=cells[1]
    raw=re.sub(r"<(?:br|/p|/div|/li|/tr|/td|/th|/h\d)>\s*","\n",html,flags=re.I)
    raw=re.sub(r"<[^>]+>"," ",raw);lines=[clean(x) for x in raw.splitlines()];lines=[x for x in lines if x]
    def row(*labels):
        for label in labels:
            key=label.lower().rstrip(":")
            if key in rows:return clean(rows[key])
            for i,line in enumerate(lines):
                low=line.lower().rstrip(":")
                if low==key and i+1<len(lines):return lines[i+1]
                if low.startswith(key+":"):return clean(line.split(":",1)[1])
        return ""
    title="";m=re.search(r"<h1\b[^>]*>(.*?)</h1>",html,re.I|re.S)
    if m:title=clean(re.sub(r"<[^>]+>"," ",m.group(1)))
    name=row("Vessel Name") or title.split(",",1)[0]
    if name.upper().startswith("VESSEL "):name=name[7:].strip()
    callsign=row("Call Sign","Callsign").upper().replace(" ","")
    if not re.fullmatch(r"[A-Z0-9]{3,10}",callsign or "") or callsign.lower() in {"class","href","callsign"}:callsign=""
    mmsi=re.sub(r"\D","",row("MMSI"))
    if len(mmsi)!=9:mmsi=""
    if not mmsi:
        mm=re.search(r"IMO\s*/\s*MMSI.{0,160}?([0-9]{7})\s*/\s*([0-9]{9})",html,re.I|re.S)
        if mm and mm.group(1)==imo:mmsi=mm.group(2)
    data={
      "name":name,"imo":imo,"type":row("Ship Type","Vessel Type"),"flag":row("Flag"),
      "year":int(plausible(number(row("Year of Build","Built")),1800,2100) or 0),
      "loa":plausible(number(row("Length Overall (m)","Length Overall","LOA")),20,500),
      "beam":plausible(number(row("Beam (m)","Beam")),3,100),
      "referenceDraft":plausible(number(row("Draught (m)","Draft (m)","Draught","Draft")),0.5,30),
      "gt":plausible(number(row("Gross Tonnage","GT")),100,600000),
      "dwt":plausible(number(row("Deadweight (t)","Deadweight","DWT")),100,700000),
      "mmsi":mmsi,"callsign":callsign,"source":"VesselFinder public particulars","sourceUrl":url,
    }
    if not data["name"] or norm_name(data["name"]) in {"VESSELFINDER","DETAILSANDCURRENTPOSITION"}:raise RuntimeError("VesselFinder particulars could not be parsed")
    return data

def wikidata(imo):
    api="https://www.wikidata.org/w/api.php?";q={"action":"query","list":"search","srsearch":f"haswbstatement:P458={imo}","srnamespace":"0","srlimit":"5","format":"json"}
    hits=json.loads(get(api+urlencode(q))).get("query",{}).get("search",[]);qid=next((x.get("title") for x in hits if re.fullmatch(r"Q\d+",x.get("title",''))),None)
    if not qid:return None
    q={"action":"wbgetentities","ids":qid,"props":"claims|labels","languages":"en|ru","format":"json"};e=json.loads(get(api+urlencode(q))).get("entities",{}).get(qid,{})
    claims=e.get("claims",{})
    def val(p):
        try:return claims[p][0]["mainsnak"]["datavalue"]["value"]
        except Exception:return None
    def qty(p):
        v=val(p)
        if not isinstance(v,dict):return 0.0
        n=number(v.get("amount"));return n*.3048 if str(v.get("unit","")).endswith("/Q3710") else n
    def sval(p):v=val(p);return v if isinstance(v,str) else ""
    name=e.get("labels",{}).get("en",{}).get("value") or e.get("labels",{}).get("ru",{}).get("value") or ""
    return {"name":name,"imo":imo,"loa":plausible(qty("P2043"),20,500),"beam":plausible(qty("P2261") or qty("P2049"),3,100),"referenceDraft":plausible(qty("P2262"),.5,30),"gt":plausible(qty("P1093"),100,600000),"mmsi":sval("P587"),"callsign":sval("P2317"),"source":"Wikidata fallback","sourceUrl":f"https://www.wikidata.org/wiki/{qid}"}

def merge(primary,fallback):
    if not primary:return fallback or {}
    if not fallback:return primary
    out=dict(primary)
    for k in ["loa","beam","referenceDraft","gt","dwt","mmsi","callsign","flag","type","year"]:
        if not out.get(k) and fallback.get(k):out[k]=fallback[k]
    if primary.get("name") and fallback.get("name") and norm_name(primary["name"])!=norm_name(fallback["name"]):out["alternateName"]=fallback["name"];out["nameConflict"]=True
    out["sources"]=[primary.get("source"),fallback.get("source")];return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--imo",required=True);ap.add_argument("--request-id",required=True);ap.add_argument("--out",required=True);a=ap.parse_args();imo=re.sub(r"\D","",a.imo)
    result={"requestId":a.request_id,"imo":imo,"status":"error","generatedUtc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    if not valid_imo(imo):result["message"]="Invalid IMO checksum"
    else:
        vf=wd=None;errs=[]
        try:vf=vessel_finder(imo)
        except Exception as e:errs.append("VesselFinder: "+str(e))
        try:wd=wikidata(imo)
        except Exception as e:errs.append("Wikidata: "+str(e))
        data=merge(vf,wd)
        if data and data.get("name"):
            result.update(data);result["status"]="ready";result["message"]="Current public particulars found" if vf else "Fallback public record found";result["confidence"]="high" if vf else "fallback";result["warnings"]=errs
        else:result["message"]="No usable public particulars found for this IMO";result["warnings"]=errs
    p=Path(a.out);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8");print(json.dumps(result,ensure_ascii=False))
if __name__=="__main__":main()
