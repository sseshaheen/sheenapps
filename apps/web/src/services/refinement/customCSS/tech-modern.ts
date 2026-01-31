export const tech_modernCSS = `
/* Tech-Forward & Modern: Neon blues/cyans, futuristic fonts, digital effects */
:root {
--tech-cyan: #00FFFF;
--tech-blue: #0080FF;
--tech-neon: #00FF41;
--tech-purple: #8A2BE2;
--tech-dark: #0A0A0A;
--tech-charcoal: #1A1A1A;
--tech-silver: #C0C0C0;
}

body {
background: linear-gradient(135deg,
var(--tech-dark) 0%,
var(--tech-charcoal) 30%,
#001122 70%,
var(--tech-dark) 100%);
font-family: 'Orbitron', 'Exo', monospace;
color: var(--tech-cyan);
line-height: 1.6;
position: relative;
overflow-x: hidden;
}

body::before {
content: '';
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background-image:
radial-gradient(circle at 20% 20%, var(--tech-cyan) 1px, transparent 1px),
radial-gradient(circle at 80% 80%, var(--tech-neon) 1px, transparent 1px),
linear-gradient(45deg, transparent 48%, rgba(0, 255, 255, 0.05) 50%, transparent 52%);
background-size: 30px 30px, 50px 50px, 100px 100px;
opacity: 0.3;
z-index: -1;
animation: matrixScroll 15s linear infinite;
}

body::after {
content: '';
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background:
linear-gradient(0deg, transparent 24%, rgba(0, 255, 255, 0.03) 25%, rgba(0, 255, 255, 0.03) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, 0.03) 75%, rgba(0, 255, 255, 0.03) 76%, transparent 77%);
background-size: 100% 4px;
opacity: 0.5;
z-index: -1;
animation: scanLines 2s linear infinite;
}

.tech-header {
background: rgba(10, 10, 10, 0.9);
backdrop-filter: blur(20px);
border: 2px solid var(--tech-cyan);
border-radius: 10px;
box-shadow:
0 0 30px var(--tech-cyan),
inset 0 0 30px rgba(0, 255, 255, 0.1),
0 8px 32px rgba(0, 128, 255, 0.3);
position: relative;
overflow: hidden;
}

.tech-header::before {
content: '';
position: absolute;
top: 0;
left: -100%;
width: 100%;
height: 100%;
background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.2), transparent);
animation: scanSweep 3s ease-in-out infinite;
}

.tech-title {
font-size: 3.5rem;
font-weight: 700;
font-family: 'Orbitron', monospace;
background: linear-gradient(45deg, var(--tech-cyan), var(--tech-blue), var(--tech-neon));
background-clip: text;
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
text-shadow:
0 0 20px rgba(0, 255, 255, 0.5),
0 0 40px rgba(0, 128, 255, 0.3);
letter-spacing: 0.1em;
text-transform: uppercase;
animation: textGlitch 4s ease-in-out infinite;
position: relative;
}

.tech-title::before {
content: attr(data-text);
position: absolute;
top: 0;
left: 2px;
color: rgba(0, 255, 65, 0.8);
z-index: -1;
animation: glitchShift 0.3s infinite;
}

.tech-button {
background: linear-gradient(45deg, var(--tech-blue), var(--tech-cyan));
border: 2px solid var(--tech-neon);
border-radius: 8px;
color: var(--tech-dark);
font-weight: 700;
font-family: 'Orbitron', monospace;
padding: 15px 35px;
text-transform: uppercase;
letter-spacing: 0.15em;
box-shadow:
0 0 25px var(--tech-cyan),
0 8px 30px rgba(0, 255, 255, 0.4),
inset 0 1px 0 rgba(255, 255, 255, 0.2);
transition: all 0.3s ease;
position: relative;
overflow: hidden;
}

.tech-button:hover {
transform: translateY(-3px) scale(1.05);
box-shadow:
0 0 40px var(--tech-cyan),
0 0 60px var(--tech-neon),
0 12px 40px rgba(0, 255, 255, 0.6);
background: linear-gradient(45deg, var(--tech-neon), var(--tech-cyan));
border-color: var(--tech-cyan);
}

.tech-button::before {
content: '';
position: absolute;
top: 0;
left: -100%;
width: 100%;
height: 100%;
background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
transition: left 0.4s ease;
}

.tech-button:hover::before {
left: 100%;
}

.tech-card {
background: rgba(10, 10, 10, 0.8);
border: 1px solid var(--tech-blue);
border-radius: 15px;
box-shadow:
0 0 25px rgba(0, 128, 255, 0.3),
inset 0 0 25px rgba(0, 255, 255, 0.1);
padding: 25px;
transition: all 0.3s ease;
position: relative;
backdrop-filter: blur(15px);
}

.tech-card::before {
content: '';
position: absolute;
top: -1px;
left: -1px;
right: -1px;
bottom: -1px;
background: linear-gradient(45deg, var(--tech-cyan), var(--tech-neon), var(--tech-blue));
border-radius: 15px;
z-index: -1;
opacity: 0;
filter: blur(1px);
transition: opacity 0.3s ease;
}

.tech-card:hover {
transform: translateY(-8px) scale(1.02);
border-color: var(--tech-cyan);
box-shadow:
0 0 40px rgba(0, 255, 255, 0.5),
0 15px 50px rgba(0, 128, 255, 0.4);
}

.tech-card:hover::before {
opacity: 0.6;
}

.tech-text {
font-size: 1rem;
line-height: 1.7;
color: var(--tech-silver);
font-weight: 400;
letter-spacing: 0.05em;
}

.tech-accent {
color: var(--tech-neon);
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.1em;
font-size: 0.9rem;
}

.tech-divider {
height: 2px;
background: linear-gradient(90deg,
transparent,
var(--tech-cyan),
var(--tech-neon),
var(--tech-cyan),
transparent);
margin: 25px 0;
position: relative;
box-shadow: 0 0 10px var(--tech-cyan);
}

.tech-divider::before {
content: '◦';
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
background: var(--tech-dark);
color: var(--tech-cyan);
font-size: 1.5rem;
padding: 0 10px;
animation: neonPulse 2s ease-in-out infinite;
}

@keyframes digitalGlow {
0%, 100% {
box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
filter: brightness(1);
}
50% {
box-shadow: 0 0 40px rgba(0, 255, 255, 0.6);
filter: brightness(1.2);
}
}

@keyframes matrixEffect {
0% {
transform: translateY(0px);
opacity: 1;
}
100% {
transform: translateY(-20px);
opacity: 0;
}
}

@keyframes neonPulse {
0%, 100% {
color: var(--tech-cyan);
text-shadow: 0 0 10px var(--tech-cyan);
}
50% {
color: var(--tech-neon);
text-shadow: 0 0 20px var(--tech-neon);
}
}

@keyframes textGlitch {
0%, 98% {
transform: translateX(0);
}
99% {
transform: translateX(-2px);
}
100% {
transform: translateX(2px);
}
}

@keyframes glitchShift {
0%, 90% {
transform: translateX(0);
opacity: 0;
}
91%, 95% {
transform: translateX(-2px);
opacity: 0.8;
}
96%, 100% {
transform: translateX(2px);
opacity: 0;
}
}

@keyframes matrixScroll {
0% {
transform: translateY(0);
}
100% {
transform: translateY(-100px);
}
}

@keyframes scanLines {
0% {
transform: translateY(0);
}
100% {
transform: translateY(4px);
}
}

@keyframes scanSweep {
0% {
left: -100%;
}
50% {
left: 100%;
}
100% {
left: 100%;
}
}

.tech-pattern {
background-image:
linear-gradient(90deg, var(--tech-cyan) 1px, transparent 1px),
linear-gradient(0deg, var(--tech-cyan) 1px, transparent 1px);
background-size: 20px 20px;
opacity: 0.1;
}

.matrix-bg {
background-image:
radial-gradient(circle, var(--tech-neon) 1px, transparent 1px);
background-size: 25px 25px;
opacity: 0.2;
animation: matrixScroll 10s linear infinite;
}

.tech-grid {
background-image:
linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
background-size: 50px 50px;
}
`;
