export const classic_timelessCSS = `
/* Classic & Timeless: Deep navy/burgundy, serif fonts, elegant transitions */
:root {
--classic-navy: #1B2951;
--classic-burgundy: #800020;
--classic-gold: #B8860B;
--classic-cream: #F5F5DC;
--classic-bronze: #CD7F32;
--classic-ivory: #FFFFF0;
}

body {
background: linear-gradient(135deg, var(--classic-navy) 0%, #2C3E50 50%, var(--classic-burgundy) 100%);
font-family: 'Playfair Display', 'Georgia', serif;
color: var(--classic-cream);
line-height: 1.8;
}

.classic-header {
background: rgba(27, 41, 81, 0.9);
backdrop-filter: blur(15px);
border-bottom: 3px solid var(--classic-gold);
border-top: 1px solid var(--classic-bronze);
box-shadow: 0 4px 20px rgba(184, 134, 11, 0.3);
position: relative;
}

.classic-header::before {
content: '';
position: absolute;
top: 0;
left: 0;
right: 0;
height: 2px;
background: linear-gradient(90deg, transparent, var(--classic-gold), transparent);
}

.classic-title {
font-size: 3.2rem;
font-weight: 700;
font-family: 'Playfair Display', serif;
color: var(--classic-gold);
text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
letter-spacing: 0.02em;
position: relative;
}

.classic-title::after {
content: '';
position: absolute;
bottom: -10px;
left: 50%;
transform: translateX(-50%);
width: 100px;
height: 2px;
background: linear-gradient(90deg, transparent, var(--classic-bronze), transparent);
}

.classic-button {
background: linear-gradient(45deg, var(--classic-burgundy), var(--classic-navy));
border: 2px solid var(--classic-gold);
border-radius: 8px;
color: var(--classic-cream);
font-weight: 600;
font-family: 'Playfair Display', serif;
padding: 15px 35px;
text-transform: uppercase;
letter-spacing: 0.1em;
box-shadow:
0 6px 20px rgba(128, 0, 32, 0.4),
inset 0 1px 0 rgba(184, 134, 11, 0.2);
transition: all 0.4s ease;
position: relative;
overflow: hidden;
}

.classic-button:hover {
transform: translateY(-3px);
box-shadow:
0 10px 30px rgba(128, 0, 32, 0.6),
0 0 20px rgba(184, 134, 11, 0.4);
background: linear-gradient(45deg, var(--classic-navy), var(--classic-burgundy));
}

.classic-button::before {
content: '';
position: absolute;
top: 0;
left: -100%;
width: 100%;
height: 100%;
background: linear-gradient(90deg, transparent, rgba(184, 134, 11, 0.2), transparent);
transition: left 0.6s ease;
}

.classic-button:hover::before {
left: 100%;
}

.classic-card {
background: rgba(27, 41, 81, 0.8);
border: 1px solid var(--classic-bronze);
border-radius: 12px;
box-shadow:
0 8px 25px rgba(0, 0, 0, 0.3),
inset 0 1px 0 rgba(184, 134, 11, 0.1);
padding: 30px;
transition: all 0.4s ease;
position: relative;
}

.classic-card::before {
content: '';
position: absolute;
top: -1px;
left: -1px;
right: -1px;
bottom: -1px;
background: linear-gradient(45deg, var(--classic-gold), var(--classic-bronze), var(--classic-gold));
border-radius: 12px;
z-index: -1;
opacity: 0;
transition: opacity 0.4s ease;
}

.classic-card:hover {
transform: translateY(-8px);
box-shadow:
0 15px 40px rgba(0, 0, 0, 0.4),
0 0 25px rgba(184, 134, 11, 0.3);
}

.classic-card:hover::before {
opacity: 1;
}

.classic-text {
font-size: 1.1rem;
line-height: 1.8;
color: var(--classic-cream);
font-style: italic;
}

.classic-ornament {
color: var(--classic-gold);
font-size: 1.5rem;
text-align: center;
margin: 20px 0;
}

@keyframes heritageRise {
0% {
transform: translateY(30px);
opacity: 0;
}
100% {
transform: translateY(0);
opacity: 1;
}
}

@keyframes elegantFloat {
0%, 100% {
transform: translateY(0px) rotate(0deg);
}
50% {
transform: translateY(-8px) rotate(0.5deg);
}
}

@keyframes timelessGlow {
0%, 100% {
box-shadow: 0 0 20px rgba(184, 134, 11, 0.2);
}
50% {
box-shadow: 0 0 30px rgba(184, 134, 11, 0.4);
}
}

.classic-pattern {
background-image:
repeating-linear-gradient(
45deg,
transparent,
transparent 10px,
rgba(184, 134, 11, 0.05) 10px,
rgba(184, 134, 11, 0.05) 20px
);
}

.classic-divider {
height: 2px;
background: linear-gradient(90deg, transparent, var(--classic-gold), transparent);
margin: 30px 0;
position: relative;
}

.classic-divider::before {
content: '❦';
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
background: var(--classic-navy);
color: var(--classic-gold);
padding: 0 15px;
font-size: 1.2rem;
}
`;
