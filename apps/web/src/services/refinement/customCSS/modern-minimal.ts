export const modern_minimalCSS = `
/* Modern & Minimal: Pure whites/grays, geometric fonts, clean animations */
:root {
--minimal-white: #FFFFFF;
--minimal-gray: #F8F9FA;
--minimal-dark: #343A40;
--minimal-accent: #6C757D;
--minimal-black: #000000;

/* Component color variables for minimal theme */
--color-surface: var(--minimal-gray);
--color-text-primary: var(--minimal-black);
--color-text-secondary: var(--minimal-dark);
--color-primary: var(--minimal-accent);
--color-border: var(--minimal-accent);
}

body {
background: linear-gradient(180deg, var(--minimal-white) 0%, var(--minimal-gray) 100%);
font-family: 'Inter', 'Helvetica Neue', sans-serif;
color: var(--minimal-dark);
line-height: 1.6;
}

.minimal-header {
background: rgba(255, 255, 255, 0.95);
backdrop-filter: blur(20px);
border-bottom: 1px solid rgba(108, 117, 125, 0.1);
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.minimal-title {
font-size: 3rem;
font-weight: 300;
font-family: 'Space Grotesk', sans-serif;
color: var(--minimal-black);
letter-spacing: -0.02em;
margin: 0;
line-height: 1.2;
}

.minimal-button {
background: var(--minimal-black);
border: 2px solid var(--minimal-black);
color: var(--minimal-white);
font-weight: 500;
font-family: 'Inter', sans-serif;
padding: 12px 32px;
border-radius: 0;
transition: all 0.2s ease;
text-transform: uppercase;
letter-spacing: 0.05em;
font-size: 0.875rem;
}

.minimal-button:hover {
background: var(--minimal-white);
color: var(--minimal-black);
transform: translateY(-1px);
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.minimal-card {
background: var(--minimal-white);
border: 1px solid rgba(108, 117, 125, 0.1);
border-radius: 0;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
padding: 2rem;
transition: all 0.2s ease;
}

.minimal-card:hover {
transform: translateY(-2px);
box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.minimal-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
gap: 2rem;
max-width: 1200px;
margin: 0 auto;
}

.minimal-stat {
text-align: center;
padding: 1rem;
}

.minimal-stat-number {
font-size: 2.5rem;
font-weight: 700;
color: var(--minimal-black);
display: block;
font-family: 'Space Grotesk', sans-serif;
}

.minimal-stat-label {
font-size: 0.875rem;
color: var(--minimal-accent);
text-transform: uppercase;
letter-spacing: 0.1em;
margin-top: 0.5rem;
}

@keyframes cleanSlide {
0% {
transform: translateX(-20px);
opacity: 0;
}
100% {
transform: translateX(0);
opacity: 1;
}
}

@keyframes precisionFade {
0% {
opacity: 0;
filter: blur(2px);
}
100% {
opacity: 1;
filter: blur(0);
}
}

@keyframes geometricScale {
0% {
transform: scale(0.95);
opacity: 0;
}
100% {
transform: scale(1);
opacity: 1;
}
}

.minimal-pattern {
background-image:
linear-gradient(90deg, rgba(108, 117, 125, 0.03) 1px, transparent 1px),
linear-gradient(0deg, rgba(108, 117, 125, 0.03) 1px, transparent 1px);
background-size: 40px 40px;
}

.minimal-text {
font-weight: 400;
line-height: 1.7;
color: var(--minimal-accent);
}
`;
