#!/usr/bin/env python3
import argparse, json
from pathlib import Path
import numpy as np
from netCDF4 import Dataset, num2date

SCALE=1e-4
MISSING=-32768

def as_float_nan(x):
    """Convert netCDF masked arrays to float32 with masked/fill cells as NaN."""
    if np.ma.isMaskedArray(x):
        return np.asarray(np.ma.filled(x, np.nan), dtype=np.float32)
    a=np.asarray(x,dtype=np.float32)
    # Protect against common NetCDF fill values that survived decoding.
    a[np.abs(a)>100.0]=np.nan
    return a

def q16(a):
    a=np.asarray(a,dtype=np.float32)
    bad=(~np.isfinite(a)) | (np.abs(a)>3.0)
    safe=np.where(bad,0.0,a)
    q=np.rint(safe/SCALE)
    q=np.clip(q,-32767,32767).astype('<i2')
    q[bad]=MISSING
    return q

def read_uv(path, depth_mean=False):
    with Dataset(path) as ds:
        lat=as_float_nan(ds.variables['latitude'][:])
        lon=as_float_nan(ds.variables['longitude'][:])
        u=as_float_nan(ds.variables['uo'][:])
        v=as_float_nan(ds.variables['vo'][:])
        if u.ndim==4:
            if depth_mean:
                with np.errstate(invalid='ignore'):
                    u=np.nanmean(u,axis=1); v=np.nanmean(v,axis=1)
            else:
                u=u[:,0]; v=v[:,0]
        tvar=ds.variables['time']
        times=num2date(tvar[:],tvar.units,getattr(tvar,'calendar','standard'),only_use_cftime_datetimes=False)
    return times,lat,lon,u,v

def read_stokes(path):
    with Dataset(path) as ds:
        lat=as_float_nan(ds.variables['latitude'][:])
        lon=as_float_nan(ds.variables['longitude'][:])
        u=as_float_nan(ds.variables['VSDX'][:])
        v=as_float_nan(ds.variables['VSDY'][:])
        tvar=ds.variables['time']
        times=num2date(tvar[:],tvar.units,getattr(tvar,'calendar','standard'),only_use_cftime_datetimes=False)
    return times,lat,lon,u,v

def iso(dt):
    try: return dt.isoformat().replace('+00:00','Z')
    except Exception: return str(dt)

def pack_uv(path,out,depth_mean=False,step=1):
    times,lat,lon,u,v=read_uv(path,depth_mean)
    lat=lat[::step]; lon=lon[::step]; u=u[:,::step,::step]; v=v[:,::step,::step]
    q16(np.stack([u,v],axis=-1)).tofile(out)
    return dict(startUtc=iso(times[0]),endUtc=iso(times[-1]),nt=len(times),ny=len(lat),nx=len(lon),lat0=float(lat[0]),latStep=float(np.median(np.diff(lat))),lon0=float(lon[0]),lonStep=float(np.median(np.diff(lon))))

def pack_stokes(path,out,step=1):
    times,lat,lon,u,v=read_stokes(path)
    lat=lat[::step]; lon=lon[::step]; u=u[:,::step,::step]; v=v[:,::step,::step]
    q16(np.stack([u,v],axis=-1)).tofile(out)
    return dict(startUtc=iso(times[0]),endUtc=iso(times[-1]),nt=len(times),ny=len(lat),nx=len(lon),lat0=float(lat[0]),latStep=float(np.median(np.diff(lat))),lon0=float(lon[0]),lonStep=float(np.median(np.diff(lon))))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--regional',required=True); ap.add_argument('--stokes',required=True); ap.add_argument('--global-uv',required=True); ap.add_argument('--assets',required=True)
    a=ap.parse_args(); A=Path(a.assets); A.mkdir(parents=True,exist_ok=True)
    reg=pack_uv(a.regional,A/'regional.bin',depth_mean=True,step=2)
    stk=pack_stokes(a.stokes,A/'stokes.bin',step=2)
    glo=pack_uv(a.global_uv,A/'global.bin',depth_mean=False,step=1)
    meta={'format':'VOLGA_DRIFTPACK_V1_1_2_FULLLOAD_MOBILE','scale':SCALE,'missing':MISSING,'startUtc':'2026-08-19T07:00:00Z','endUtc':'2026-09-01T07:00:00Z','localOffsetHours':3,'fixed':{'vessel':'VOLGA-4007','imo':'8728816','cargo':'6,000 MT COPPER','draftM':4.68,'leeway':0.003,'integrationMinutes':15,'blendHours':24,'loadCondition':'FULL LOAD / SUMMER DRAFT','currentVerticalMean':'CMEMS available levels 0.50-4.52 m','leewayNote':'Fixed engineering assumption for full-load v1.1.2; k=0.003 (0.3% of wind speed downwind)'},'regional':reg,'stokes':stk,'global':glo,'domain':{'minLat':42.5,'maxLat':45.5,'minLon':35.0,'maxLon':39.5}}
    (A/'meta.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    print('Built:',{p.name:p.stat().st_size for p in A.glob('*.bin')})
if __name__=='__main__': main()
