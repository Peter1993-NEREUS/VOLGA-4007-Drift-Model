#!/usr/bin/env python3
import argparse, json, re, sys, time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

UA = "MarineDrift-NEREUS/1.5 (+https://github.com/Peter1993-NEREUS/VOLGA-4007-Drift-Model)"

def valid_imo(imo):
    if not re.fullmatch(r"\d{7}", imo): return False
    return sum(int(imo[i]) * (7-i) for i in range(6)) % 10 == int(imo[6])

def get(url, timeout=25):
    req=Request(url,headers={"User-Agent":UA,"Accept":"text/html,application/json;q=0.9,*/*;q=0.8"})
    with urlopen(req,timeout=timeout) as r:
        return r.read().decode("utf-8","replace")

def clean(x):
    x=re.sub(r"\s+"," ",str(x or "")).strip()
    return "" if x in {"-","--","N/A","n/a"} else x

def number(x):
    m=re.search(r"[-+]?\d+(?:[.,]\d+)?",str(x or ""))
    return float(m.group(0).replace(",",".")) if m else 0.0

def norm_name(x):
    return re.sub(r"[^A-Z0-9]","",str(x or "").upper())

def vessel_finder(imo):
    url=f"https://www.vesselfinder.com/vessels/details/{imo}"
    html=get(url)
    if "VesselFinder" not in html or len(html)<2000:
        raise RuntimeError("VesselFinder response unavailable")
    # Parse table-like rows without relying on unstable CSS class names.
    rows={}
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>",html,flags=re.I|re.S):
        cells=[]
        for c in re.findall(r"<(?:th|td)\b[^>]*>(.*?)</(?:th|td)>",tr,flags=re.I|re.S):
            t=re.sub(r"<[^>]+>"," ",c)
            t=clean(t.replace("&nbsp;"," ").replace("&amp;","&"))
            if t: cells.append(t)
        if len(cells)>=2: rows[cells[0].lower().rstrip(":")]=cells[1]
    # Generic text fallback for pages whose particulars are not in <tr>.
    text=clean(re.sub(r"<[^>]+>","\n",html))
    def row(*labels):
        for label in labels:
            key=label.lower()
            if key in rows:return clean(rows[key])
            m=re.search(re.escape(label)+r"\s*[:|]?\s*([^\n|]{1,120})",text,re.I)
            if m:return clean(m.group(1))
        return ""
    title=""
    m=re.search(r"<h1\b[^>]*>(.*?)</h1>",html,re.I|re.S)
    if m:title=clean(re.sub(r"<[^>]+>"," ",m.group(1)))
    name=row("Vessel Name") or title
    if name.upper().startswith("VESSEL "): name=name[7:].strip()
    data={
      "name":name,
      "imo":imo,
      "type":row("Ship Type"),
      "flag":row("Flag"),
      "year":int(number(row("Year of Build")) or 0),
      "loa":number(row("Length Overall (m)","Length Overall")),
      "beam":number(row("Beam (m)","Beam")),
      "referenceDraft":number(row("Draught (m)","Draft (m)","Draught")),
      "gt":number(row("Gross Tonnage")),
      "dwt":number(row("Deadweight (t)","Deadweight")),
      "mmsi":"",
      "callsign":"",
      "source":"VesselFinder public particulars",
      "sourceUrl":url,
    }
    # Read IMO/MMSI and callsign only as identifiers; never ingest AIS position/voyage.
    mm=re.search(r"IMO\s*/\s*MMSI\s*</?[^>]*>?.{0,120}?([0-9]{7})\s*/\s*([0-9]{9})",html,re.I|re.S)
    if mm and mm.group(1)==imo:data["mmsi"]=mm.group(2)
    cs=re.search(r"Callsign\s*</?[^>]*>?.{0,100}?([A-Z0-9]{3,12})",html,re.I|re.S)
    if cs:data["callsign"]=cs.group(1)
    if not data["name"] or norm_name(data["name"]) in {"VESSELFINDER","DETAILSANDCURRENTPOSITION"}:
        raise RuntimeError("VesselFinder particulars could not be parsed")
    return data

def wikidata(imo):
    api="https://www.wikidata.org/w/api.php?"
    q={"action":"query","list":"search","srsearch":f"haswbstatement:P458={imo}","srnamespace":"0","srlimit":"5","format":"json"}
    s=json.loads(get(api+urlencode(q)))
    hits=s.get("query",{}).get("search",[])
    qid=next((x.get("title") for x in hits if re.fullmatch(r"Q\d+",x.get("title",''))),None)
    if not qid: return None
    q={"action":"wbgetentities","ids":qid,"props":"claims|labels","languages":"en|ru","format":"json"}
    e=json.loads(get(api+urlencode(q))).get("entities",{}).get(qid,{})
    claims=e.get("claims",{})
    def val(p):
        try:return claims[p][0]["mainsnak"]["datavalue"]["value"]
        except Exception:return None
    def qty(p):
        v=val(p)
        if not isinstance(v,dict):return 0.0
        n=number(v.get("amount"))
        if str(v.get("unit","")).endswith("/Q3710"):n*=0.3048
        return n
    def sval(p):
        v=val(p); return v if isinstance(v,str) else ""
    name=e.get("labels",{}).get("en",{}).get("value") or e.get("labels",{}).get("ru",{}).get("value") or ""
    return {"name":name,"imo":imo,"loa":qty("P2043"),"beam":qty("P2261") or qty("P2049"),"referenceDraft":qty("P2262"),"gt":qty("P1093"),"mmsi":sval("P587"),"callsign":sval("P2317"),"source":"Wikidata fallback","sourceUrl":f"https://www.wikidata.org/wiki/{qid}"}

def merge(primary, fallback):
    if not primary:return fallback or {}
    if not fallback:return primary
    out=dict(primary)
    for k in ["loa","beam","referenceDraft","gt","dwt","mmsi","callsign","flag","type","year"]:
        if not out.get(k) and fallback.get(k):out[k]=fallback[k]
    if primary.get("name") and fallback.get("name") and norm_name(primary["name"])!=norm_name(fallback["name"]):
        out["alternateName"]=fallback["name"]
        out["nameConflict"]=True
    out["sources"]=[primary.get("source"),fallback.get("source")]
    return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--imo",required=True);ap.add_argument("--request-id",required=True);ap.add_argument("--out",required=True);a=ap.parse_args()
    imo=re.sub(r"\D","",a.imo)
    result={"requestId":a.request_id,"imo":imo,"status":"error","generatedUtc":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    if not valid_imo(imo):
        result["message"]="Invalid IMO checksum"
    else:
        vf=wd=None;errs=[]
        try:vf=vessel_finder(imo)
        except Exception as e:errs.append("VesselFinder: "+str(e))
        try:wd=wikidata(imo)
        except Exception as e:errs.append("Wikidata: "+str(e))
        data=merge(vf,wd)
        if data and data.get("name"):
            result.update(data);result["status"]="ready";result["message"]="Current public particulars found" if vf else "Fallback public record found"
            result["confidence"]="high" if vf else "fallback"
            result["warnings"]=errs
        else:
            result["message"]="No usable public particulars found for this IMO"
            result["warnings"]=errs
    p=Path(a.out);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False))

if __name__=="__main__":main()
