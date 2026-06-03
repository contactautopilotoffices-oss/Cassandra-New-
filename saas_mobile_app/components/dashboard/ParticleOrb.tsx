/**
 * ParticleOrb — 4200-particle FBM noise orb
 *
 * Renders the orb at 200×200 logical resolution, then scales down to fit
 * the nav slot. This preserves the "open and flowing" particle spread of
 * the full-screen HTML version instead of cramming everything into 72px.
 *
 * Platform embedding:
 *   • Web: <iframe srcDoc> (react-native-webview has no web impl)
 *   • Native (iOS/Android): react-native-webview
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

let WebView: any;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const _S = '</scr' + 'ipt>';

// ─── Minified orb HTML ─────────────────────────────────────────────────────
// Canvas is fixed at 200×200 logical pixels. CSS stretches it to fill the
// iframe/WebView container. The container itself is scaled down externally.
const ORB_HTML =
  '<!DOCTYPE html>' +
  '<html lang="en"><head><meta charset="UTF-8">' +
  '<style>' +
  '*{margin:0;padding:0;box-sizing:border-box}' +
  'html,body{width:100%;height:100%;background:transparent;overflow:hidden}' +
  'canvas{display:block;width:100%;height:100%}' +
  '</style></head><body>' +
  '<canvas id="o"></canvas>' +
  '<scr' + 'ipt>' +
  'var c=document.getElementById("o"),x=c.getContext("2d");' +
  'var dpr=window.devicePixelRatio||1;' +
  'c.width=200*dpr;c.height=200*dpr;' +
  'x.scale(dpr,dpr);' +
  'function fd(t){return t*t*t*(t*(t*6-15)+10)}' +
  'function lp(a,b,t){return a+(b-a)*t}' +
  'function hs(X,Y,Z){var v=Math.sin(X*127.1+Y*311.7+Z*74.7)*43758.5453;return v-Math.floor(v)}' +
  'function n3(X,Y,Z){' +
  'var ix=0|X,iy=0|Y,iz=0|Z,fx=X-ix,fy=Y-iy,fz=Z-iz;' +
  'var ux=fd(fx),uy=fd(fy),uz=fd(fz);' +
  'return lp(' +
  'lp(lp(hs(ix,iy,iz),hs(ix+1,iy,iz),ux),lp(hs(ix,iy+1,iz),hs(ix+1,iy+1,iz),ux),uy),' +
  'lp(lp(hs(ix,iy,iz+1),hs(ix+1,iy,iz+1),ux),lp(hs(ix,iy+1,iz+1),hs(ix+1,iy+1,iz+1),ux),uy),' +
  'uz)}' +
  'function fbm(X,Y,Z,o){' +
  'var v=0,a=0.5,f=1,m=0;for(var i=0;i<o;i++){v+=n3(X*f,Y*f,Z*f)*a;m+=a;a*=0.5;f*=2.1}' +
  'return v/m}' +
  'var C=4200,P=[],i;' +
  'for(i=0;i<C;i++){' +
  'var u=Math.random(),v=Math.random(),t=6.2831853*u,p=Math.acos(2*v-1);' +
  'var rr=Math.pow(Math.random(),0.35),ic=Math.random()<0.05,sp=Math.sin(p);' +
  'P.push({bx:sp*Math.cos(t),by:sp*Math.sin(t),bz:Math.cos(p),' +
  'r:ic?Math.random()*0.3:rr,ph:Math.random()*6.2831853,bs:0.4+Math.random()*0.6,' +
  'ox:Math.random()*37.3,oy:Math.random()*53.1,oz:Math.random()*71.9,' +
  'ns:0.08+Math.random()*0.14,ic:ic,sz:ic?2.5+Math.random()*1.5:0.5+Math.random()*1.8})' +
  '}' +
  'function ry(X,Y,Z,a){var c=Math.cos(a),s=Math.sin(a);return[X*c+Z*s,Y,-X*s+Z*c]}' +
  'function rx(X,Y,Z,a){var c=Math.cos(a),s=Math.sin(a);return[X,Y*c-Z*s,Y*s+Z*c]}' +
  'function oc(d,fn,al){' +
  'var cm=Math.pow(Math.max(0,1-d*1.4),1.5);' +
  'var r=0|lp(20,255,cm),g=0|lp(200,255,cm*0.4+0.6),b=0|lp(30,220,cm);' +
  'var df=0.25+0.75*fn,ef=d>0.85?Math.pow(1-(d-0.85)/0.15,1.5):1;' +
  'return"rgba("+r+","+g+","+b+","+(al*df*ef).toFixed(3)+")"}' +
  'var T=0,AY=0,AX=0;' +
  'function an(){' +
  'requestAnimationFrame(an);x.clearRect(0,0,200,200);' +
  'T+=0.012;AY+=0.0035;AX=Math.sin(T*0.25)*0.18;var tY=AY;' +
  'var CX=100,CY=100,R=56;' + // R = 200 * 0.28
  'var BS=1+Math.sin(T*0.7)*0.04+Math.sin(T*1.1)*0.02,B=[];' +
  'for(i=0;i<C;i++){' +
  'var p=P[i],ns=1.8,nt=T*p.ns;' +
  'var nx=fbm(p.bx*ns+p.ox+nt,p.by*ns,p.bz*ns,3);' +
  'var ny=fbm(p.bx*ns,p.by*ns+p.oy+nt,p.bz*ns,3);' +
  'var nz=fbm(p.bx*ns,p.by*ns,p.bz*ns+p.oz+nt,3);' +
  'var ds=0.25,dx=(nx-0.5)*ds,dy=(ny-0.5)*ds,dz=(nz-0.5)*ds;' +
  'var pb=1+Math.sin(T*p.bs+p.ph)*0.06,er=p.r*BS*pb;' +
  'var px=(p.bx+dx)*er*R,py=(p.by+dy)*er*R,pz=(p.bz+dz)*er*R;' +
  'var t1=ry(px,py,pz,tY);px=t1[0];py=t1[1];pz=t1[2];' +
  'var t2=rx(px,py,pz,AX);px=t2[0];py=t2[1];pz=t2[2];' +
  'var ps=900,sc=ps/(ps+pz+R*0.3);' +
  'var sx=CX+px*sc,sy=CY+py*sc,d=p.r,fn=(pz+R)/(2*R+1);' +
  'var al=p.ic?0.8+Math.random()*0.2:lp(0.85,0.45,d)*(0.7+Math.sin(T*p.bs+p.ph)*0.3);' +
  'var psz=p.sz*sc*lp(1.2,0.6,d);' +
  'B.push({sx:sx,sy:sy,pz:pz,ps:psz,d:d,fn:fn,al:al})' +
  '}' +
  'B.sort(function(a,b){return a.pz-b.pz});' +
  'for(i=0;i<B.length;i++){var d=B[i];if(d.d>0.6)continue;' +
  'x.beginPath();x.arc(d.sx,d.sy,Math.max(0.01,d.ps*5),0,6.2831853);' +
  'x.fillStyle=oc(d.d,d.fn,0.018);x.fill()}' +
  'for(i=0;i<B.length;i++){var d=B[i];x.beginPath();x.arc(d.sx,d.sy,Math.max(0.01,d.ps),0,6.2831853);' +
  'x.fillStyle=oc(d.d,d.fn,d.al);x.fill()}' +
  'var br=Math.max(0.01,R*0.35*BS),bg=x.createRadialGradient(CX,CY,0,CX,CY,br);' +
  'bg.addColorStop(0,"rgba(220,255,220,0.22)");' +
  'bg.addColorStop(0.3,"rgba(160,255,160,0.10)");' +
  'bg.addColorStop(0.7,"rgba(80,200,80,0.04)");' +
  'bg.addColorStop(1,"rgba(0,120,0,0)");' +
  'x.beginPath();x.arc(CX,CY,br,0,6.2831853);x.fillStyle=bg;x.fill()' +
  '}' +
  'an();' +
  _S +
  '</body></html>';

const RENDER_SIZE = 200;

// Inner WebView — memoized so it never re-creates on parent re-renders
const OrbWebView = React.memo(function OrbWebView({ size, scale }: { size: number; scale: number }) {
  return (
    <View
      style={[
        styles.clipper,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <View
        style={{
          width: RENDER_SIZE,
          height: RENDER_SIZE,
          transform: [{ scale }],
          transformOrigin: 'top left',
        }}
      >
        <WebView
          source={{ html: ORB_HTML }}
          style={{ width: RENDER_SIZE, height: RENDER_SIZE, backgroundColor: 'transparent' }}
          scrollEnabled={false}
          pointerEvents="none"
          opaque={false}
          androidLayerType="hardware"
        />
      </View>
    </View>
  );
});

export default React.memo(function ParticleOrb({ size = 90 }: { size?: number }) {
  const scale = useMemo(() => size / RENDER_SIZE, [size]);

  // ─── Web: iframe scaled with CSS transform ───────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.clipper,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {/* @ts-ignore */}
        <iframe
          srcDoc={ORB_HTML}
          style={{
            width: RENDER_SIZE,
            height: RENDER_SIZE,
            border: 'none',
            background: 'transparent',
            pointerEvents: 'none',
            display: 'block',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          scrolling="no"
        />
      </View>
    );
  }

  // ─── Native: WebView inside a scaled wrapper ─────────────────────────────
  return <OrbWebView size={size} scale={scale} />;
});

const styles = StyleSheet.create({
  clipper: {
    overflow: 'hidden',
  },
});
