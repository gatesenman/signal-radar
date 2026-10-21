import { EXACT } from './i18n-en.js';
import ICONS from './icons.js';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import logo from '../build/icon.svg';
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
export const Ev = ({ list }) => list?.length ? <div className="basis">{list.map((e, i) => <div key={i}><I n="links-line" /> <Src s={e.source} /><L u={e.url}>{String(e.title).slice(0, 110)}</L>{e.refs?.length ? <Cite refs={e.refs} /> : null}</div>)}</div> : null;
// v3.2 编号引文：点击滚动到证据链对应行（借鉴 AlphaSense [[N • Source]] / LlamaIndex Source N）
export const Cite = ({ refs }) => refs?.length ? <span className="cites">{[...new Set(refs)].map(n => <a key={n} className="cite" href={'#ev-' + n} onClick={e => { e.preventDefault(); const el = document.getElementById('ev-' + n); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } }} title={'证据 #' + n}>[{n}]</a>)}</span> : null;
export const PH = ({ icon, title, sub, children }) => <div className="ph"><div><h1><I n={icon} s={19} />{title}</h1>{sub && <div className="sub">{sub}</div>}</div><span className="sp" />{children}</div>;
// 图表颜色走设计令牌：option 里写 'var(--x)'，渲染前按当前主题解析为实际颜色；主题切换时重建实例
const cssVar = s => typeof s === 'string' && localStorage.getItem('lang') === 'en' && EXACT[s] ? EXACT[s] : typeof s === 'string' && s.startsWith('var(') ? getComputedStyle(document.documentElement).getPropertyValue(s.slice(4, -1).split(',')[0].trim()).trim() || s : s;
const resolve = o => Array.isArray(o) ? o.map(resolve) : o && typeof o === 'object' && !(o instanceof Date) && typeof o !== 'function' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'function' ? v : resolve(v)])) : cssVar(o);
export const CHART = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
export function Chart({ option, h = 260, onClick }) {
  const ref = useRef(), inst = useRef(), th = document.documentElement.dataset.theme || 'dark';
  useEffect(() => { inst.current = echarts.init(ref.current, th === 'light' ? null : 'dark'); const ro = new ResizeObserver(() => inst.current.resize()); ro.observe(ref.current); return () => { ro.disconnect(); inst.current.dispose(); }; }, [th]);
  useEffect(() => { inst.current.setOption(resolve({ backgroundColor: 'transparent', color: CHART, textStyle: { fontFamily: 'Noto Sans CJK SC, PingFang SC, sans-serif', color: 'var(--tx2)' }, ...option }), true); inst.current.off('click'); onClick && inst.current.on('click', onClick); }, [option, th]);
  return <div ref={ref} style={{ height: h, width: '100%' }} />;
}
export const radarOpt = (o, cmp) => ({ radar: { radius: '66%', indicator: Object.values(D).map(n => ({ name: n, max: 100 })), splitArea: { areaStyle: { color: ['var(--panel2)', 'var(--panel)'] } }, axisName: { color: 'var(--mut)', fontSize: 11 } }, legend: cmp ? { bottom: 0, textStyle: { color: 'var(--mut)' } } : undefined,
  series: [{ type: 'radar', data: [o, ...(cmp ? [cmp] : [])].map((x, i) => ({ name: x.title, value: Object.keys(D).map(k => x.dims[k]), areaStyle: { opacity: .3 }, lineStyle: { width: 2 }, itemStyle: { color: ['var(--c3)', 'var(--ok)'][i] }, label: { show: i === 0, color: 'var(--tx-strong)', fontSize: 10 } })) }] });
export const grid = { left: 44, right: 16, top: 26, bottom: 26 }, axl = { lineStyle: { color: 'var(--heat0)' } };
export const Empty = ({ refresh, busy, text }) => <div className="empty card"><I n="radar-line" />{text || '还没有数据。点击「立即采集」从 50+ 个公开来源拉取实时信号。'}<br /><br />{refresh && <button onClick={() => refresh()} disabled={busy}><I n="refresh-line" />立即采集</button>}</div>;
export { logo, useEffect, useState, useMemo, React };

// v2.9 生命周期徽标（爆发/稳定增长/已见顶/下滑/平稳；急升 = 短期快速变化）
const LIFE = { exploding: ['爆发', 'g'], regular: ['稳定增长', 'p'], peaked: ['已见顶', 'o'], declining: ['下滑', 'r'], flat: ['平稳', ''] };
export const Life = ({ l }) => l?.stage === 'young' || l?.stage === 'sparse' ? <span className="tag n" title={'有效采集 ' + (l.covered || 0) + ' 天，需 ≥7 天且 ≥6 条'}>{l.stage === 'young' ? '样本期不足' : '样本稀疏'}</span> : l ? <span className={'tag ' + (LIFE[l.stage]?.[1] || '')} title={`robust z=${l.z} · 斜率 ${l.slope} · 波动 ${l.vol}${l.cp ? ` · 变点 ${l.cp.day} 天` : ''}`}>{LIFE[l.stage]?.[0]}{l.pace === 'rapid' ? ' · 急升' : ''}{l.fad ? ' ⚠' : ''}{l.provisional ? '（初判）' : ''}</span> : null;
