export const warm_approachableCSS = `
/* Warm & Approachable: Coral/peach tones, rounded typography, gentle bounces */
:root {
--warm-coral: #FF7F7F;
--warm-peach: #FFCBA4;
--warm-cream: #FFF8E7;
--warm-sunset: #FFB347;
--warm-blush: #FFB6C1;

/* Component color variables for warm theme */
--color-surface: var(--warm-cream);
--color-text-primary: #8B4513;
--color-text-secondary: #A0522D;
--color-primary: var(--warm-coral);
--color-border: var(--warm-peach);
}

body {
background: linear-gradient(135deg, var(--warm-cream) 0%, var(--warm-peach) 50%, var(--warm-blush) 100%);
font-family: 'Nunito', 'Comic Sans MS', sans-serif;
color: #8B4513;
}

.warm-header {
background: rgba(255, 203, 164, 0.8);
backdrop-filter: blur(10px);
border-radius: 20px;
border: 3px solid var(--warm-coral);
box-shadow: 0 8px 32px rgba(255, 127, 127, 0.3);
}

.warm-title {
font-size: 2.8rem;
font-weight: 800;
font-family: 'Fredoka One', cursive;
color: var(--warm-coral);
text-shadow: 2px 2px 4px rgba(255, 127, 127, 0.3);
letter-spacing: 0.02em;
}

.warm-button {
background: linear-gradient(45deg, var(--warm-coral), var(--warm-sunset));
border: none;
border-radius: 25px;
color: white;
font-weight: 700;
font-family: 'Nunito', sans-serif;
padding: 15px 30px;
box-shadow: 0 6px 20px rgba(255, 127, 127, 0.4);
transition: all 0.3s ease;
transform-origin: center;
}

.warm-button:hover {
transform: translateY(-2px) scale(1.05);
box-shadow: 0 10px 30px rgba(255, 127, 127, 0.6);
background: linear-gradient(45deg, var(--warm-sunset), var(--warm-coral));
}

.warm-card {
background: rgba(255, 248, 231, 0.9);
border-radius: 20px;
border: 2px solid var(--warm-peach);
box-shadow: 0 6px 20px rgba(255, 182, 193, 0.2);
padding: 20px;
transition: all 0.3s ease;
}

.warm-card:hover {
transform: translateY(-5px) rotate(1deg);
box-shadow: 0 12px 30px rgba(255, 182, 193, 0.4);
}

@keyframes gentleBounce {
0%, 100% { transform: translateY(0px); }
50% { transform: translateY(-8px); }
}

@keyframes warmGlow {
0%, 100% {
box-shadow: 0 0 20px rgba(255, 127, 127, 0.3);
filter: brightness(1);
}
50% {
box-shadow: 0 0 30px rgba(255, 127, 127, 0.5);
filter: brightness(1.1);
}
}

@keyframes heartFloat {
0%, 100% { transform: translateY(0px) rotate(-5deg); }
25% { transform: translateY(-3px) rotate(0deg); }
75% { transform: translateY(-1px) rotate(5deg); }
}

.warm-emoji {
animation: heartFloat 2s ease-in-out infinite;
display: inline-block;
}

.warm-pattern {
background-image:
radial-gradient(circle at 25% 25%, rgba(255, 127, 127, 0.1) 0%, transparent 50%),
radial-gradient(circle at 75% 75%, rgba(255, 182, 193, 0.1) 0%, transparent 50%);
}
`;
