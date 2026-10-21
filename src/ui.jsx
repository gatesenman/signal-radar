import ICONS from './icons.js';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import logo from '../build/icon.png';
export const api = window.api;
export const D = { market: '市场规模', growth: '增长动能', competition: '竞争(反向)', moat: '可防御性', monetization: '变现清晰度', fit: '创始人匹配' };
export const C = { segments: '客户细分', problem: '问题', value: '价值主张', solution: '解决方案', channels: '渠道', revenue: '收入来源', costs: '成本结构', metrics: '关键指标', advantage: '壁垒/不公平优势' };
export const KIND = { community: '社区', code: '代码', product: '产品', research: '研究', news: '新闻', jobs: '招聘', funding: '资本', social: '社交', demand: '需求', supply: '供给', policy: '政策', macro: '宏观' };
export const STAGES = [['discover', '发现', 'ri-compass-3-line'], ['screen', '初筛', 'ri-filter-3-line'], ['research', '深研', 'ri-search-eye-line'], ['validate', '验证', 'ri-flask-line'], ['go', '立项', 'ri-rocket-2-line'], ['drop', '放弃', 'ri-close-circle-line']];
export const CATC = { 技术: '', 资本: 'g', 需求: 'o', 供给: 'p', 人才: 'o', 宏观: 'n', 政策: 'r', 行业: 'p', 中文: 'r' };
export const fmt = ts => ts ? new Date(ts * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
export const $M = v => v == null ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v).toLocaleString();
export const I = ({ n, c, s, onClick }) => { const d = ICONS[String(n || '').replace(/^ri-/, '')]; return <svg className="ic" viewBox="0 0 24 24" width={s || '1em'} height={s || '1em'} fill="currentColor" aria-hidden="true" onClick={onClick} style={c ? { color: c } : undefined} dangerouslySetInnerHTML={{ __html: d || '<circle cx="12" cy="12" r="3"/>' }} />; };
export const Src = ({ s }) => <span className="tag n">{s}</span>;
export const L = ({ u, children }) => <a className="l" onClick={e => { e.stopPropagation(); api.call('open:url', u); }} title={u}>{children}</a>;
export const Bar = ({ v }) => <div className="bar"><i style={{ width: Math.max(2, Math.min(100, v)) + '%' }} /></div>;
export const Conf = ({ v }) => <span className={'tag ' + (v >= .6 ? 'g' : v >= .35 ? 'o' : 'r')}>置信度 {v >= .6 ? '高' : v >= .35 ? '中' : '低'} {v}</span>;
export const Ev = ({ list }) => list?.length ? <div className="basis">{list.map((e, i) => <div key={i}><I n="links-line" /> <Src s={e.source} /><L u={e.url}>{String(e.title).slice(0, 110)}</L></div>)}</div> : null;
export const PH = ({ icon, title, sub, children }) => <div className="ph"><div><h1><I n={icon} s={19} />{title}</h1>{sub && <div className="sub">{sub}</div>}</div><span className="sp" />{children}</div>;
export function Chart({ option, h = 260, onClick }) {
  const ref = useRef(), inst = useRef();
  useEffect(() => { inst.current = echarts.init(ref.current, document.documentElement.dataset.theme === 'light' ? null : 'dark'); const ro = new ResizeObserver(() => inst.current.resize()); ro.observe(ref.current); return () => { ro.disconnect(); inst.current.dispose(); }; }, []);
  useEffect(() => { inst.current.setOption({ backgroundColor: 'transparent', textStyle: { fontFamily: 'Noto Sans CJK SC, PingFang SC, sans-serif' }, ...option }, true); inst.current.off('click'); onClick && inst.current.on('click', onClick); }, [option]);
  return <div ref={ref} style={{ height: h, width: '100%' }} />;
}
export const radarOpt = (o, cmp) => ({ radar: { radius: '66%', indicator: Object.values(D).map(n => ({ name: n, max: 100 })), splitArea: { areaStyle: { color: ['#0e1524', '#111a2c'] } }, axisName: { color: '#9aa6ba', fontSize: 11 } }, legend: cmp ? { bottom: 0, textStyle: { color: '#9aa6ba' } } : undefined,
  series: [{ type: 'radar', data: [o, ...(cmp ? [cmp] : [])].map((x, i) => ({ name: x.title, value: Object.keys(D).map(k => x.dims[k]), areaStyle: { opacity: .3 }, lineStyle: { width: 2 }, itemStyle: { color: ['#a855f7', '#22c55e'][i] }, label: { show: i === 0, color: '#fff', fontSize: 10 } })) }] });
export const grid = { left: 44, right: 16, top: 26, bottom: 26 }, axl = { lineStyle: { color: '#1e293b' } };
export const Empty = ({ refresh, busy, text }) => <div className="empty card"><I n="radar-line" />{text || '还没有数据。点击「立即采集」从 50+ 个公开来源拉取实时信号。'}<br /><br />{refresh && <button onClick={() => refresh()} disabled={busy}><I n="refresh-line" />立即采集</button>}</div>;
export { logo, useEffect, useState, useMemo, React };
