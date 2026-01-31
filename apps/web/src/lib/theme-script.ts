// This script is injected inline to prevent theme flash and hydration mismatch
// It runs before React hydrates to set the correct initial theme
// IMPORTANT: Keep this as a single-line string to avoid script parsing issues
export const themeInitScriptMinified = "(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'dark';}document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t;}catch(e){}})()";