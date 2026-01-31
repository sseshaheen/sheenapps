export const bold_vibrantCSS = `
/* Bold & Vibrant: Electric colors, dynamic typography, energetic animations */
:root {
--vibrant-electric: #00FFFF;
--vibrant-neon: #FF1493;
--vibrant-lime: #32CD32;
--vibrant-orange: #FF4500;
--vibrant-purple: #8A2BE2;
--vibrant-yellow: #FFD700;

/* Component color variables for vibrant theme */
--color-surface: rgba(0, 0, 0, 0.1);
--color-text-primary: #1A1A1A;
--color-text-secondary: #2D2D2D;
--color-primary: var(--vibrant-neon);
--color-border: var(--vibrant-electric);
}

body {
background: linear-gradient(45deg,
var(--vibrant-purple) 0%,
var(--vibrant-neon) 25%,
var(--vibrant-orange) 50%,
var(--vibrant-lime) 75%,
var(--vibrant-electric) 100%);
background-size: 300% 300%;
animation: vibrantFlow 8s ease-in-out infinite;
font-family: 'Oswald', 'Impact', sans-serif;
color: white;
overflow-x: hidden;
}

.vibrant-header {
background: rgba(0, 0, 0, 0.8);
backdrop-filter: blur(15px);
border: 3px solid var(--vibrant-electric);
border-radius: 15px;
box-shadow:
0 0 30px var(--vibrant-electric),
inset 0 0 30px rgba(0, 255, 255, 0.1);
animation: vibrantGlow 2s ease-in-out infinite alternate;
}

.vibrant-title {
font-size: 4rem;
font-weight: 900;
font-family: 'Black Ops One', cursive;
background: linear-gradient(45deg,
var(--vibrant-electric),
var(--vibrant-neon),
var(--vibrant-lime),
var(--vibrant-yellow));
background-clip: text;
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
animation: textPulse 1.5s ease-in-out infinite;
letter-spacing: 0.1em;
text-transform: uppercase;
}

.vibrant-button {
background: linear-gradient(45deg, var(--vibrant-neon), var(--vibrant-orange));
border: 3px solid var(--vibrant-electric);
border-radius: 50px;
color: white;
font-weight: 900;
font-family: 'Oswald', sans-serif;
padding: 18px 40px;
text-transform: uppercase;
letter-spacing: 0.1em;
box-shadow:
0 0 25px var(--vibrant-neon),
0 8px 30px rgba(255, 20, 147, 0.4);
transition: all 0.3s ease;
position: relative;
overflow: hidden;
}

.vibrant-button:hover {
transform: scale(1.1) rotate(2deg);
box-shadow:
0 0 40px var(--vibrant-electric),
0 0 60px var(--vibrant-neon),
0 12px 40px rgba(255, 20, 147, 0.6);
background: linear-gradient(45deg, var(--vibrant-electric), var(--vibrant-lime));
}

.vibrant-button::before {
content: '';
position: absolute;
top: 0;
left: -100%;
width: 100%;
height: 100%;
background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
transition: left 0.5s;
}

.vibrant-button:hover::before {
left: 100%;
}

.vibrant-card {
background: rgba(0, 0, 0, 0.7);
border: 2px solid var(--vibrant-lime);
border-radius: 20px;
box-shadow:
0 0 25px rgba(50, 205, 50, 0.3),
inset 0 0 25px rgba(50, 205, 50, 0.1);
padding: 25px;
transition: all 0.3s ease;
position: relative;
}

.vibrant-card:hover {
transform: translateY(-10px) rotate(1deg) scale(1.02);
border-color: var(--vibrant-neon);
box-shadow:
0 0 40px rgba(255, 20, 147, 0.5),
0 15px 50px rgba(255, 20, 147, 0.3);
}

.vibrant-text {
font-size: 1.2rem;
font-weight: 600;
line-height: 1.4;
text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

@keyframes vibrantFlow {
0%, 100% { background-position: 0% 50%; }
50% { background-position: 100% 50%; }
}

@keyframes vibrantGlow {
0% {
box-shadow:
0 0 30px var(--vibrant-electric),
inset 0 0 30px rgba(0, 255, 255, 0.1);
}
100% {
box-shadow:
0 0 50px var(--vibrant-neon),
inset 0 0 50px rgba(255, 20, 147, 0.2);
}
}

@keyframes textPulse {
0%, 100% {
transform: scale(1);
filter: brightness(1);
}
50% {
transform: scale(1.05);
filter: brightness(1.2);
}
}

@keyframes vibrantPulse {
0%, 100% {
transform: scale(1);
filter: hue-rotate(0deg) brightness(1);
}
25% {
transform: scale(1.02);
filter: hue-rotate(90deg) brightness(1.1);
}
50% {
transform: scale(1.05);
filter: hue-rotate(180deg) brightness(1.2);
}
75% {
transform: scale(1.02);
filter: hue-rotate(270deg) brightness(1.1);
}
}

@keyframes energyBurst {
0% {
transform: scale(0.8) rotate(-5deg);
opacity: 0;
}
50% {
transform: scale(1.1) rotate(2deg);
opacity: 1;
}
100% {
transform: scale(1) rotate(0deg);
opacity: 1;
}
}

@keyframes colorShift {
0% { filter: hue-rotate(0deg); }
25% { filter: hue-rotate(90deg); }
50% { filter: hue-rotate(180deg); }
75% { filter: hue-rotate(270deg); }
100% { filter: hue-rotate(360deg); }
}

.vibrant-pattern {
background-image:
radial-gradient(circle at 20% 20%, var(--vibrant-electric) 2px, transparent 2px),
radial-gradient(circle at 80% 80%, var(--vibrant-neon) 2px, transparent 2px),
linear-gradient(45deg, transparent 40%, rgba(255, 215, 0, 0.1) 50%, transparent 60%);
background-size: 50px 50px, 50px 50px, 100px 100px;
animation: colorShift 10s linear infinite;
}
`;
