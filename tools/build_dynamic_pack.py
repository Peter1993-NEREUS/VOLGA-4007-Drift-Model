#!/usr/bin/env python3
import argparse, json, math
from pathlib import Path
import numpy as np
from netCDF4 import Dataset, num2date

SCALE=1e-4
MISSING=-32768
TARGET_FILE_BYTES=42_000_000


def arr(x):
    if np.ma.isMaskedArray(x):
        return np.asarray(np.ma.filled(x,np.nan),dtype=np.float32)
    a=np.asarray(x,dtype=np.float32)
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


def iso(d):
    s=d.isoformat()
    if not (s.endswith('Z') or '+' in s[10:]): s+='Z'
    return s.replace('+00:00','Z')


def times_info(ds):
    tv=ds.variables['time']
    ts=num2date(tv[:],tv.units,getattr(tv,'calendar','standard'),only_use_cftime_datetimes=False)
    if len(ts)>1:
        step=float(np.median([(ts[i+1]-ts[i]).total_seconds()/3600 for i in range(len(ts)-1)]))
    else:
        step=1.0
    return ts,iso(ts[0]),iso(ts[-1]),step


def adaptive_step(nt,ny,nx,target=TARGET_FILE_BYTES):
    # packed file has u+v as int16 => 4 bytes per grid point per time slice
    raw=max(1,nt)*max(1,ny)*max(1,nx)*4
    if raw<=target:
        return 1
    return max(1,int(math.ceil(math.sqrt(raw/target))))


def shrink(lat,lon,u,v,target=TARGET_FILE_BYTES):
    step=adaptive_step(u.shape[0],u.shape[1],u.shape[2],target)
    if step>1:
        lat=lat[::step]; lon=lon[::step]
        u=u[:,::step,::step]; v=v[:,::step,::step]
    return lat,lon,u,v,step


def grid_meta(lat,lon,ts,start,end,step,spatial_step=1):
    return dict(startUtc=start,endUtc=end,nt=len(ts),ny=len(lat),nx=len(lon),
                lat0=float(lat[0]),latStep=float(np.median(np.diff(lat))) if len(lat)>1 else 1.0,
                lon0=float(lon[0]),lonStep=float(np.median(np.diff(lon))) if len(lon)>1 else 1.0,
                timeStepHours=step,spatialSubsample=spatial_step)


def read_current(path,draft):
    with Dataset(path) as ds:
        lat=arr(ds.variables['latitude'][:]); lon=arr(ds.variables['longitude'][:])
        u=arr(ds.variables['uo'][:]); v=arr(ds.variables['vo'][:])
        depth_note='surface layer only'
        if u.ndim==4:
            dname='depth' if 'depth' in ds.variables else ('depth_coord' if 'depth_coord' in ds.variables else None)
            if dname:
                dep=arr(ds.variables[dname][:])
                idx=np.where(dep<=draft+0.25)[0]
                if len(idx)==0: idx=np.array([0])
                with np.errstate(invalid='ignore'):
                    u=np.nanmean(u[:,idx,:,:],axis=1); v=np.nanmean(v[:,idx,:,:],axis=1)
                depth_note=f'mean of {len(idx)} available CMEMS levels from {float(dep[idx[0]]):.2f} to {float(dep[idx[-1]]):.2f} m for draft {draft:.2f} m'
            else:
                u=u[:,0,:,:]; v=v[:,0,:,:]
        ts,start,end,tstep=times_info(ds)
    lat,lon,u,v,sstep=shrink(lat,lon,u,v)
    return lat,lon,u,v,grid_meta(lat,lon,ts,start,end,tstep,sstep),depth_note


def read_stokes(path):
    with Dataset(path) as ds:
        lat=arr(ds.variables['latitude'][:]); lon=arr(ds.variables['longitude'][:])
        u=arr(ds.variables['VSDX'][:]); v=arr(ds.variables['VSDY'][:])
        while u.ndim>3: u=u[:,0]
        while v.ndim>3: v=v[:,0]
        ts,start,end,tstep=times_info(ds)
    lat,lon,u,v,sstep=shrink(lat,lon,u,v)
    return lat,lon,u,v,grid_meta(lat,lon,ts,start,end,tstep,sstep)


def write_pair(u,v,path):
    q16(np.stack([u,v],axis=-1)).tofile(path)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--global-current',required=True)
    p.add_argument('--stokes',required=True)
    p.add_argument('--regional')
    p.add_argument('--out',required=True)
    p.add_argument('--request-id',required=True)
    p.add_argument('--start-utc',required=True)
    p.add_argument('--end-utc',required=True)
    p.add_argument('--draft',type=float,required=True)
    p.add_argument('--vessel',default='CUSTOM VESSEL'); p.add_argument('--imo',default='')
    p.add_argument('--cargo',default=''); p.add_argument('--loa',type=float,default=0); p.add_argument('--beam',type=float,default=0)
    p.add_argument('--leeway',type=float,default=0.003); p.add_argument('--local-offset',type=float,default=3)
    p.add_argument('--current-product',required=True); p.add_argument('--wave-product',required=True)
    a=p.parse_args(); O=Path(a.out); O.mkdir(parents=True,exist_ok=True)

    lat,lon,u,v,g,gdepth=read_current(a.global_current,a.draft); write_pair(u,v,O/'global.bin')
    slat,slon,su,sv,s=read_stokes(a.stokes); write_pair(su,sv,O/'stokes.bin')

    r=None; rdepth=None
    if a.regional and Path(a.regional).exists() and Path(a.regional).stat().st_size>0:
        try:
            rlat,rlon,ru,rv,r,rdepth=read_current(a.regional,a.draft); write_pair(ru,rv,O/'regional.bin')
        except Exception as e:
            print('Regional pack skipped:',e); r=None; rdepth=None

    # Requested boundaries are authoritative. Source grids are intentionally padded
    # by the workflow so interpolation remains possible exactly at these boundaries.
    start=a.start_utc
    end=a.end_utc
    domain={'minLat':float(max(lat.min(),slat.min())),'maxLat':float(min(lat.max(),slat.max())),
            'minLon':float(max(lon.min(),slon.min())),'maxLon':float(min(lon.max(),slon.max()))}

    current_note=(rdepth+'; global fallback: '+gdepth) if rdepth else ('global: '+gdepth)
    meta={'format':'VOLGA_DRIFTPACK_V1_3_1_DYNAMIC','scale':SCALE,'missing':MISSING,'requestId':a.request_id,
          'startUtc':start,'endUtc':end,'localOffsetHours':a.local_offset,'domain':domain,
          'fixed':{'vessel':a.vessel,'imo':a.imo,'cargo':a.cargo,'draftM':a.draft,'loaM':a.loa,'beamM':a.beam,
                   'leeway':a.leeway,'integrationMinutes':15,'blendHours':24,'loadCondition':'USER DEFINED',
                   'currentVerticalMean':current_note,
                   'leewayNote':'User-defined coefficient; wind source controlled in app'},
          'global':g,'stokes':s,'regional':r,
          'products':{'globalCurrent':a.current_product,'stokes':a.wave_product,
                      'regionalCurrent':'cmems_mod_blk_phy-cur_anfc_2.5km_PT1H-m' if r else None}}
    manifest={'requestId':a.request_id,'status':'ready','startUtc':start,'endUtc':end,
              'domain':domain,'regional':bool(r),'format':meta['format']}
    (O/'meta.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    (O/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps(meta,indent=2))
    print('Packed sizes:',{p.name:p.stat().st_size for p in O.glob('*.bin')})

if __name__=='__main__': main()
