import{r as n,j as e}from"./index-BXFZJKZ8.js";import{c as y,d as f,e as x,f as S,_ as j,g as a,M as w,L as g,O as k,S as M}from"./components-CTSN4E9F.js";/**
 * @remix-run/react v2.17.4
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */let l="positions";function O({getKey:r,...c}){let{isSpaMode:p}=y(),o=f(),h=x();S({getKey:r,storageKey:l});let u=n.useMemo(()=>{if(!r)return null;let t=r(o,h);return t!==o.key?t:null},[]);if(p)return null;let d=((t,m)=>{if(!window.history.state||!window.history.state.key){let s=Math.random().toString(32).slice(2);window.history.replaceState({key:s},"")}try{let i=JSON.parse(sessionStorage.getItem(t)||"{}")[m||window.history.state.key];typeof i=="number"&&window.scrollTo(0,i)}catch(s){console.error(s),sessionStorage.removeItem(t)}}).toString();return n.createElement("script",j({},c,{suppressHydrationWarning:!0,dangerouslySetInnerHTML:{__html:`(${d})(${a(JSON.stringify(l))}, ${a(JSON.stringify(u))})`}}))}function R(){return e.jsxs("html",{children:[e.jsxs("head",{children:[e.jsx("meta",{charSet:"utf-8"}),e.jsx("meta",{name:"viewport",content:"width=device-width,initial-scale=1"}),e.jsx("link",{rel:"preconnect",href:"https://cdn.shopify.com/"}),e.jsx("link",{rel:"stylesheet",href:"https://cdn.shopify.com/static/fonts/inter/v4/styles.css"}),e.jsx(w,{}),e.jsx(g,{})]}),e.jsxs("body",{children:[e.jsx(k,{}),e.jsx(O,{}),e.jsx(M,{})]})]})}export{R as default};
