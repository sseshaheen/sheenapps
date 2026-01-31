export const luxury_premiumCSS = `
/* Luxury Premium: Rich golds, sophisticated blacks, premium textures */
:root {
--luxury-gold: #D4AF37;
--luxury-black: #1A1A1A;
--luxury-champagne: #F7E7CE;
--luxury-platinum: #E5E4E2;

/* Component color variables for luxury theme */
--color-surface: rgba(212, 175, 55, 0.05);
--color-text-primary: var(--luxury-black);
--color-text-secondary: #3A3A3A;
--color-primary: var(--luxury-gold);
--color-border: var(--luxury-platinum);
}

body {
background: linear-gradient(135deg, var(--luxury-black) 0%, #2C2C2C 50%, var(--luxury-black) 100%);
font-family: 'Playfair Display', 'Times New Roman', serif;
color: var(--luxury-champagne);
}

.luxury-header {
background: rgba(212, 175, 55, 0.1);
backdrop-filter: blur(20px);
border-bottom: 1px solid var(--luxury-gold);
box-shadow: 0 4px 30px rgba(212, 175, 55, 0.2);
}

.luxury-title {
font-size: 3.5rem;
font-weight: 700;
letter-spacing: 0.05em;
background: linear-gradient(45deg, var(--luxury-gold), var(--luxury-champagne), var(--luxury-gold));
background-clip: text;
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
text-shadow: 0 2px 4px rgba(212, 175, 55, 0.3);
}

.luxury-button {
background: linear-gradient(45deg, var(--luxury-gold), #B8860B);
border: 2px solid var(--luxury-gold);
color: var(--luxury-black);
font-weight: 600;
letter-spacing: 0.1em;
text-transform: uppercase;
box-shadow: 0 8px 25px rgba(212, 175, 55, 0.4);
transition: all 0.4s ease;
}

.luxury-button:hover {
transform: translateY(-3px);
box-shadow: 0 12px 35px rgba(212, 175, 55, 0.6);
background: linear-gradient(45deg, #B8860B, var(--luxury-gold));
}

@keyframes goldenShimmer {
0%, 100% { box-shadow: 0 0 20px rgba(212, 175, 55, 0.3); }
50% { box-shadow: 0 0 40px rgba(212, 175, 55, 0.6); }
}

@keyframes luxuryFloat {
0%, 100% { transform: translateY(0px) rotate(0deg); }
50% { transform: translateY(-10px) rotate(1deg); }
}

.luxury-pattern {
background-image:
radial-gradient(circle at 20% 50%, rgba(212, 175, 55, 0.1) 0%, transparent 50%),
radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.05) 0%, transparent 50%);
}
`;
