export const boutique_exclusiveCSS = `
/* Boutique & Exclusive: Soft pastels, refined typography, subtle glows */
:root {
--boutique-blush: #F7E7E7;
--boutique-sage: #E8F4E8;
--boutique-lavender: #F0E6FF;
--boutique-pearl: #F8F8FF;
--boutique-rose: #E8D5D5;
--boutique-silver: #C0C0C0;
--boutique-charcoal: #4A4A4A;
}

body {
background: linear-gradient(135deg,
var(--boutique-pearl) 0%,
var(--boutique-blush) 30%,
var(--boutique-sage) 60%,
var(--boutique-lavender) 100%);
font-family: 'Cormorant Garamond', 'Crimson Text', serif;
color: var(--boutique-charcoal);
line-height: 1.7;
}

.boutique-header {
background: rgba(248, 248, 255, 0.85);
backdrop-filter: blur(25px);
border: 1px solid rgba(192, 192, 192, 0.3);
border-radius: 15px;
box-shadow:
0 8px 32px rgba(192, 192, 192, 0.2),
inset 0 1px 0 rgba(255, 255, 255, 0.8);
margin: 20px;
}

.boutique-title {
font-size: 2.8rem;
font-weight: 400;
font-family: 'Cormorant Garamond', serif;
color: var(--boutique-charcoal);
letter-spacing: 0.05em;
text-align: center;
position: relative;
font-style: italic;
}

.boutique-title::before {
content: '◊';
position: absolute;
left: -40px;
top: 50%;
transform: translateY(-50%);
color: var(--boutique-silver);
font-size: 1.5rem;
}

.boutique-title::after {
content: '◊';
position: absolute;
right: -40px;
top: 50%;
transform: translateY(-50%);
color: var(--boutique-silver);
font-size: 1.5rem;
}

.boutique-button {
background: linear-gradient(45deg, var(--boutique-rose), var(--boutique-blush));
border: 1px solid var(--boutique-silver);
border-radius: 30px;
color: var(--boutique-charcoal);
font-weight: 500;
font-family: 'Cormorant Garamond', serif;
padding: 12px 30px;
font-size: 1rem;
letter-spacing: 0.1em;
box-shadow:
0 4px 15px rgba(192, 192, 192, 0.25),
inset 0 1px 0 rgba(255, 255, 255, 0.6);
transition: all 0.4s ease;
position: relative;
overflow: hidden;
}

.boutique-button:hover {
transform: translateY(-2px);
box-shadow:
0 8px 25px rgba(192, 192, 192, 0.4),
0 0 15px rgba(232, 213, 213, 0.5);
background: linear-gradient(45deg, var(--boutique-blush), var(--boutique-lavender));
}

.boutique-button::before {
content: '';
position: absolute;
top: 0;
left: -100%;
width: 100%;
height: 100%;
background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
transition: left 0.8s ease;
}

.boutique-button:hover::before {
left: 100%;
}

.boutique-card {
background: rgba(248, 248, 255, 0.8);
border: 1px solid rgba(192, 192, 192, 0.2);
border-radius: 20px;
box-shadow:
0 6px 20px rgba(192, 192, 192, 0.15),
inset 0 1px 0 rgba(255, 255, 255, 0.7);
padding: 25px;
transition: all 0.5s ease;
position: relative;
backdrop-filter: blur(10px);
}

.boutique-card::before {
content: '';
position: absolute;
top: -1px;
left: -1px;
right: -1px;
bottom: -1px;
background: linear-gradient(45deg,
var(--boutique-rose),
var(--boutique-sage),
var(--boutique-lavender));
border-radius: 20px;
z-index: -1;
opacity: 0;
filter: blur(2px);
transition: opacity 0.5s ease;
}

.boutique-card:hover {
transform: translateY(-6px) scale(1.02);
box-shadow:
0 12px 35px rgba(192, 192, 192, 0.25),
0 0 20px rgba(232, 213, 213, 0.3);
}

.boutique-card:hover::before {
opacity: 0.3;
}

.boutique-text {
font-size: 1rem;
line-height: 1.8;
color: var(--boutique-charcoal);
font-style: italic;
letter-spacing: 0.02em;
}

.boutique-accent {
color: var(--boutique-silver);
font-size: 0.9rem;
text-transform: uppercase;
letter-spacing: 0.2em;
font-weight: 500;
}

.boutique-divider {
width: 60px;
height: 1px;
background: linear-gradient(90deg, transparent, var(--boutique-silver), transparent);
margin: 20px auto;
position: relative;
}

.boutique-divider::before {
content: '✧';
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
background: var(--boutique-pearl);
color: var(--boutique-silver);
font-size: 0.8rem;
padding: 0 8px;
}

@keyframes refinedEntry {
0% {
transform: translateY(20px);
opacity: 0;
filter: blur(3px);
}
100% {
transform: translateY(0);
opacity: 1;
filter: blur(0);
}
}

@keyframes whisperFloat {
0%, 100% {
transform: translateY(0px) rotate(0deg);
}
33% {
transform: translateY(-3px) rotate(0.3deg);
}
66% {
transform: translateY(-1px) rotate(-0.3deg);
}
}

@keyframes exclusiveGlow {
0%, 100% {
box-shadow: 0 0 15px rgba(192, 192, 192, 0.2);
filter: brightness(1);
}
50% {
box-shadow: 0 0 25px rgba(232, 213, 213, 0.4);
filter: brightness(1.05);
}
}

.boutique-pattern {
background-image:
radial-gradient(circle at 25% 25%, rgba(192, 192, 192, 0.05) 2px, transparent 2px),
radial-gradient(circle at 75% 75%, rgba(232, 213, 213, 0.05) 2px, transparent 2px);
background-size: 60px 60px, 40px 40px;
}

.boutique-monogram {
font-family: 'Cormorant Garamond', serif;
font-size: 2rem;
font-weight: 300;
color: var(--boutique-silver);
text-align: center;
margin: 15px 0;
letter-spacing: 0.2em;
}
`;
