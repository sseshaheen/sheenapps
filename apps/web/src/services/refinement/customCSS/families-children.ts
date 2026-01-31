export const families_childrenCSS = `
/* Families with Children: Warm, playful, kid-friendly design */
:root {
--family-orange: #ff9500;
--family-blue: #007aff;
--family-green: #34c759;
--family-yellow: #ffcc02;
--family-pink: #ff2d92;
}

body {
background: linear-gradient(135deg, #fef7e7 0%, #fef3c7 50%, #fde68a 100%);
font-family: 'Comic Sans MS', 'Nunito', sans-serif;
color: #8B4513;
}

.family-features {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
gap: 1rem;
}

.kid-friendly {
background: linear-gradient(135deg, #ff6b6b20, #74b9ff20);
border-radius: 15px;
padding: 1.5rem;
border: 3px solid var(--family-orange);
box-shadow: 0 8px 25px rgba(255, 149, 0, 0.3);
}
`;
