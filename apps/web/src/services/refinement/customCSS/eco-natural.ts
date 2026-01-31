export const eco_naturalCSS = `
/* Eco & Natural: Forest greens, organic curves, leaf-like animations */
:root {
--eco-forest: #2D5016;
--eco-sage: #87A96B;
--eco-moss: #8FBC8F;
--eco-earth: #D2B48C;
--eco-sky: #87CEEB;
--eco-bark: #8B4513;
--eco-cream: #F5F5DC;
}

body {
background: linear-gradient(135deg,
var(--eco-sky) 0%,
var(--eco-cream) 20%,
var(--eco-sage) 60%,
var(--eco-forest) 100%);
font-family: 'Merriweather', 'Libre Baskerville', serif;
color: var(--eco-forest);
line-height: 1.8;
position: relative;
}

body::before {
content: '';
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background-image:
url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><path d="M20,30 Q30,10 40,30 T60,30" stroke="%23087f2380" stroke-width="1" fill="none"/><path d="M10,60 Q25,40 40,60 T70,60" stroke="%23059f4680" stroke-width="1" fill="none"/></svg>');
background-size: 200px 200px;
opacity: 0.3;
z-index: -1;
animation: naturalFlow 20s ease-in-out infinite;
}

.eco-header {
background: rgba(245, 245, 220, 0.9);
backdrop-filter: blur(15px);
border: 2px solid var(--eco-sage);
border-radius: 25px;
box-shadow:
0 8px 25px rgba(45, 80, 22, 0.2),
inset 0 1px 0 rgba(255, 255, 255, 0.7);
position: relative;
overflow: hidden;
}

.eco-header::before {
content: '';
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 4px;
background: linear-gradient(90deg,
var(--eco-forest),
var(--eco-sage),
var(--eco-moss),
var(--eco-sage),
var(--eco-forest));
background-size: 200% 100%;
animation: naturalFlow 8s ease-in-out infinite;
}

.eco-title {
font-size: 3rem;
font-weight: 700;
font-family: 'Merriweather', serif;
color: var(--eco-forest);
text-shadow: 1px 1px 2px rgba(45, 80, 22, 0.2);
position: relative;
display: inline-block;
}

.eco-title::after {
content: '🌿';
position: absolute;
top: -10px;
right: -30px;
font-size: 1.5rem;
animation: leafSway 3s ease-in-out infinite;
}

.eco-button {
background: linear-gradient(45deg, var(--eco-sage), var(--eco-moss));
border: 2px solid var(--eco-forest);
border-radius: 50px;
color: white;
font-weight: 600;
font-family: 'Merriweather', serif;
padding: 15px 35px;
text-transform: capitalize;
letter-spacing: 0.05em;
box-shadow:
0 6px 20px rgba(45, 80, 22, 0.3),
inset 0 1px 0 rgba(255, 255, 255, 0.3);
transition: all 0.4s ease;
position: relative;
overflow: hidden;
}

.eco-button:hover {
transform: translateY(-3px) scale(1.02);
box-shadow:
0 10px 30px rgba(45, 80, 22, 0.4),
0 0 20px rgba(135, 169, 107, 0.5);
background: linear-gradient(45deg, var(--eco-forest), var(--eco-sage));
}

.eco-button::before {
content: '';
position: absolute;
top: 0;
left: -100%;
width: 100%;
height: 100%;
background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
transition: left 0.6s ease;
}

.eco-button:hover::before {
left: 100%;
}

.eco-card {
background: rgba(245, 245, 220, 0.85);
border: 2px solid var(--eco-sage);
border-radius: 20px;
box-shadow:
0 8px 25px rgba(45, 80, 22, 0.2),
inset 0 1px 0 rgba(255, 255, 255, 0.6);
padding: 25px;
transition: all 0.4s ease;
position: relative;
backdrop-filter: blur(10px);
}

.eco-card::before {
content: '';
position: absolute;
top: -2px;
left: -2px;
right: -2px;
bottom: -2px;
background: linear-gradient(45deg,
var(--eco-forest),
var(--eco-sage),
var(--eco-moss));
border-radius: 22px;
z-index: -1;
opacity: 0;
transition: opacity 0.4s ease;
}

.eco-card:hover {
transform: translateY(-8px) rotate(0.5deg);
box-shadow:
0 15px 40px rgba(45, 80, 22, 0.3),
0 0 25px rgba(135, 169, 107, 0.4);
}

.eco-card:hover::before {
opacity: 0.7;
}

.eco-text {
font-size: 1.1rem;
line-height: 1.8;
color: var(--eco-forest);
font-weight: 400;
}

.eco-badge {
background: linear-gradient(135deg, var(--eco-forest), var(--eco-sage));
color: white;
padding: 6px 15px;
border-radius: 25px;
font-size: 0.85rem;
font-weight: 600;
display: inline-block;
box-shadow: 0 2px 8px rgba(45, 80, 22, 0.3);
letter-spacing: 0.05em;
}

.eco-icon {
color: var(--eco-sage);
font-size: 2rem;
margin: 15px 0;
animation: leafSway 4s ease-in-out infinite;
display: inline-block;
}

.eco-divider {
height: 3px;
background: linear-gradient(90deg,
transparent,
var(--eco-sage),
var(--eco-moss),
var(--eco-sage),
transparent);
margin: 25px 0;
border-radius: 2px;
position: relative;
}

.eco-divider::before {
content: '🌱';
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
background: var(--eco-cream);
padding: 0 10px;
font-size: 1rem;
}

@keyframes leafFloat {
0%, 100% {
transform: translateY(0px) rotate(0deg);
}
25% {
transform: translateY(-6px) rotate(2deg);
}
50% {
transform: translateY(-3px) rotate(-1deg);
}
75% {
transform: translateY(-8px) rotate(1deg);
}
}

@keyframes naturalGrow {
0% {
transform: scale(0.8) rotate(-2deg);
opacity: 0;
filter: blur(2px);
}
50% {
transform: scale(1.02) rotate(1deg);
opacity: 1;
filter: blur(0);
}
100% {
transform: scale(1) rotate(0deg);
opacity: 1;
filter: blur(0);
}
}

@keyframes ecoBreeze {
0%, 100% {
transform: translateX(0px);
filter: hue-rotate(0deg);
}
25% {
transform: translateX(2px);
filter: hue-rotate(5deg);
}
75% {
transform: translateX(-2px);
filter: hue-rotate(-5deg);
}
}

@keyframes leafSway {
0%, 100% {
transform: rotate(0deg);
}
25% {
transform: rotate(3deg);
}
75% {
transform: rotate(-3deg);
}
}

@keyframes naturalFlow {
0%, 100% {
background-position: 0% 50%;
transform: translateX(0px);
}
50% {
background-position: 100% 50%;
transform: translateX(5px);
}
}

.eco-pattern {
background-image:
radial-gradient(circle at 20% 20%, rgba(45, 80, 22, 0.1) 2px, transparent 2px),
radial-gradient(circle at 80% 80%, rgba(135, 169, 107, 0.1) 2px, transparent 2px),
linear-gradient(45deg, transparent 40%, rgba(143, 188, 143, 0.05) 50%, transparent 60%);
background-size: 60px 60px, 40px 40px, 80px 80px;
}

.natural-texture {
background-image:
url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" fill="none"><path d="M10,30 Q20,10 30,30 Q40,50 50,30" stroke="%23599b5b40" stroke-width="2" fill="none"/><circle cx="15" cy="25" r="1" fill="%23599b5b60"/><circle cx="45" cy="35" r="1" fill="%23599b5b60"/></svg>');
background-size: 120px 120px;
}
`;
