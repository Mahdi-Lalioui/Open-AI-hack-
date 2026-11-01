import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles.css';
import './landing.css';
import { LandingPage } from './LandingPage';
import { DESIGNS, LandingViewport, SketchLines } from './shared';

const q = new URLSearchParams(location.search).get('align');
const d = DESIGNS.find((x) => x.id === q);
ReactDOM.createRoot(document.getElementById('root')!).render(
  d ? <div className="landing" style={{ width: 800, height: 700, background: '#fff' }}><div className="lp-frame" style={{ inset: 0, height: 700 }}><LandingViewport blueprint={d.blueprint} revealKey="x" reducedMotion /><SketchLines blueprint={d.blueprint} animate={false} /></div><style>{'.landing .lp-sketch path{stroke:#ff0040!important}'}</style></div>
    : <React.StrictMode><LandingPage /></React.StrictMode>);
