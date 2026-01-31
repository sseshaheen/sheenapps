// Enhanced Ideal AI Response with Modular Design System
// Multiple questions with granular, composable visual components
// This shows what a comprehensive, satisfying response should look like

export const IDEAL_AI_RESPONSE = {
  questions: [
    {
      id: "visual-foundation-1",
      category: "visual-foundation",
      question: "What personality should your salon app convey?",
      context: "This sets the foundational visual language for your entire brand",
      difficulty: "beginner",
      options: [
        {
          id: "luxury-premium",
          title: "Luxury & Premium",
          description: "Sophisticated, high-end experience for discerning clients",
          shortDescription: "High-end elegance",
          impactTags: {
            visual: ["luxury", "sophisticated", "elegant"],
            layout: ["spacious", "minimal"],
            functionality: ["vip-features", "concierge"],
            experience: ["premium", "exclusive"],
            device: ["desktop-optimized"]
          },
          previewHints: {
            primaryEffect: "luxury",
            secondaryEffects: ["spacious", "premium"],
            targetElements: ["entire-site"],
            complexity: "high"
          },
          // Enhanced modular preview impact
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "luxury",
              typography: "elegant",
              header: {
                component: "luxury",
                props: {
                  businessName: "LUXE SALON",
                  tagline: "LUXURY REDEFINED",
                  logoIcon: "♛",
                  navItems: [
                    { label: "Services", url: "#" },
                    { label: "Masters", url: "#" },
                    { label: "Experience", url: "#" }
                  ],
                  ctaText: "BOOK VIP"
                }
              },
              animations: ["gradientShift", "shimmer", "float"],
              customCSS: `
                /* Luxury theme enhancements */
                .luxury-glow {
                  box-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
                }
                .luxury-border {
                  border: 1px solid rgba(212, 175, 55, 0.3);
                }
              `
            }
          },
          // Legacy comprehensive preview for fallback
          comprehensivePreviewImpact: {
            type: "complete-transformation",
            changes: {
              // Complete HTML structure changes
              htmlStructure: {
                headerHTML: `
                  <header style="background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(20,20,20,0.9) 100%); backdrop-filter: blur(20px); padding: 1.5rem 0; border-bottom: 2px solid transparent; border-image: linear-gradient(90deg, transparent, #d4af37, transparent) 1; position: sticky; top: 0; z-index: 1000; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                    <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
                      <div style="display: flex; align-items: center; gap: 1.5rem;">
                        <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #d4af37, #f6e19c); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(212, 175, 55, 0.4);">
                          <span style="font-size: 1.5rem; color: #000;">♛</span>
                        </div>
                        <div>
                          <div style="font-size: 1.8rem; font-weight: 700; letter-spacing: 2px; color: #d4af37; font-family: 'Playfair Display', serif; line-height: 1;">LUXE SALON</div>
                          <div style="font-size: 0.75rem; color: #888; letter-spacing: 3px; margin-top: 2px;">LUXURY REDEFINED</div>
                        </div>
                      </div>
                      <nav style="display: flex; gap: 2.5rem; align-items: center;">
                        <a href="#" style="color: #e5e5e5; text-decoration: none; font-weight: 400; letter-spacing: 0.5px; transition: all 0.3s; position: relative; padding: 0.5rem 0;" onmouseover="this.style.color='#d4af37'" onmouseout="this.style.color='#e5e5e5'">Services</a>
                        <a href="#" style="color: #e5e5e5; text-decoration: none; font-weight: 400; letter-spacing: 0.5px; transition: all 0.3s; position: relative; padding: 0.5rem 0;" onmouseover="this.style.color='#d4af37'" onmouseout="this.style.color='#e5e5e5'">Masters</a>
                        <a href="#" style="color: #e5e5e5; text-decoration: none; font-weight: 400; letter-spacing: 0.5px; transition: all 0.3s; position: relative; padding: 0.5rem 0;" onmouseover="this.style.color='#d4af37'" onmouseout="this.style.color='#e5e5e5'">Experience</a>
                        <a href="#" style="background: linear-gradient(135deg, #d4af37 0%, #f6e19c 50%, #d4af37 100%); color: #000; padding: 0.875rem 2.5rem; border-radius: 50px; font-weight: 600; text-decoration: none; letter-spacing: 0.5px; box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4); transition: all 0.3s; border: 1px solid rgba(255,255,255,0.1);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(212, 175, 55, 0.6)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(212, 175, 55, 0.4)'">BOOK VIP</a>
                      </nav>
                    </div>
                  </header>
                `,
                heroHTML: `
                  <section style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center; position: relative; padding: 0; background: radial-gradient(ellipse at center, #0a0a0a 0%, #000000 100%); overflow: hidden;">
                    <!-- Animated background elements -->
                    <div style="position: absolute; inset: 0; background: linear-gradient(45deg, transparent 48%, rgba(212, 175, 55, 0.03) 49%, rgba(212, 175, 55, 0.03) 51%, transparent 52%), linear-gradient(-45deg, transparent 48%, rgba(212, 175, 55, 0.03) 49%, rgba(212, 175, 55, 0.03) 51%, transparent 52%); background-size: 60px 60px; opacity: 0.3; animation: shimmer 20s linear infinite;"></div>
                    <div style="position: absolute; top: 10%; right: 10%; width: 300px; height: 300px; background: radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%); border-radius: 50%; filter: blur(100px);"></div>
                    <div style="position: absolute; bottom: 20%; left: 15%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%); border-radius: 50%; filter: blur(80px);"></div>
                    
                    <div style="max-width: 1200px; margin: 0 auto; padding: 0 3rem; text-align: center; z-index: 10;">
                      <!-- Premium badge -->
                      <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, rgba(212, 175, 55, 0.1), rgba(246, 225, 156, 0.05)); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 50px; padding: 0.75rem 2rem; margin-bottom: 3rem; backdrop-filter: blur(10px);">
                        <span style="color: #d4af37; font-size: 0.9rem;">✨</span>
                        <span style="color: #d4af37; font-size: 0.85rem; letter-spacing: 1px; font-weight: 500;">LUXURY REDEFINED</span>
                      </div>
                      
                      <!-- Main headline with stunning typography -->
                      <h1 style="font-size: clamp(3rem, 8vw, 7rem); font-weight: 200; line-height: 1.1; margin-bottom: 2rem; font-family: 'Playfair Display', serif; position: relative;">
                        <span style="background: linear-gradient(135deg, #d4af37 0%, #f6e19c 25%, #d4af37 50%, #f6e19c 75%, #d4af37 100%); background-size: 300% 300%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: gradientShift 4s ease-in-out infinite;">WHERE ELEGANCE</span><br/>
                        <span style="background: linear-gradient(135deg, #f6e19c 0%, #d4af37 25%, #f6e19c 50%, #d4af37 75%, #f6e19c 100%); background-size: 300% 300%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: gradientShift 4s ease-in-out infinite reverse; letter-spacing: 8px;">MEETS EXCELLENCE</span>
                      </h1>
                      
                      <!-- Sophisticated subtitle -->
                      <p style="font-size: 1.4rem; color: rgba(255, 255, 255, 0.8); margin-bottom: 3rem; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.6; font-weight: 300; letter-spacing: 0.5px;">Experience the pinnacle of luxury grooming where master artisans craft your vision into reality</p>
                      
                      <!-- Premium CTA buttons -->
                      <div style="display: flex; gap: 1.5rem; justify-content: center; margin-bottom: 5rem; flex-wrap: wrap;">
                        <button style="background: linear-gradient(135deg, #d4af37 0%, #f6e19c 50%, #d4af37 100%); color: #000; border: none; padding: 1.2rem 3.5rem; font-size: 1rem; border-radius: 50px; font-weight: 600; letter-spacing: 1px; cursor: pointer; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 8px 30px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2); position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.boxShadow='0 15px 40px rgba(212, 175, 55, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 30px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'">
                          <span style="position: relative; z-index: 2;">BOOK PRIVATE CONSULTATION</span>
                        </button>
                        <button style="border: 2px solid rgba(212, 175, 55, 0.6); background: rgba(212, 175, 55, 0.05); color: #d4af37; padding: 1.2rem 3.5rem; font-size: 1rem; border-radius: 50px; font-weight: 500; letter-spacing: 1px; cursor: pointer; transition: all 0.4s; backdrop-filter: blur(10px);" onmouseover="this.style.background='rgba(212, 175, 55, 0.1)'; this.style.borderColor='#d4af37'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='rgba(212, 175, 55, 0.05)'; this.style.borderColor='rgba(212, 175, 55, 0.6)'; this.style.transform='translateY(0)'">EXPLORE VIP SERVICES</button>
                      </div>
                      
                      <!-- Elegant trust indicators -->
                      <div style="display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; background: rgba(0, 0, 0, 0.3); padding: 1rem 2rem; border-radius: 15px; border: 1px solid rgba(212, 175, 55, 0.2); backdrop-filter: blur(10px);">
                          <div style="color: #d4af37; font-size: 1.1rem;">⭐⭐⭐⭐⭐</div>
                          <div style="color: rgba(255, 255, 255, 0.9); font-size: 0.9rem; font-weight: 500;">Forbes 5-Star</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem; background: rgba(0, 0, 0, 0.3); padding: 1rem 2rem; border-radius: 15px; border: 1px solid rgba(212, 175, 55, 0.2); backdrop-filter: blur(10px);">
                          <div style="color: #d4af37; font-size: 1.1rem;">🏆</div>
                          <div style="color: rgba(255, 255, 255, 0.9); font-size: 0.9rem; font-weight: 500;">Master Stylists</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem; background: rgba(0, 0, 0, 0.3); padding: 1rem 2rem; border-radius: 15px; border: 1px solid rgba(212, 175, 55, 0.2); backdrop-filter: blur(10px);">
                          <div style="color: #d4af37; font-size: 1.1rem;">👑</div>
                          <div style="color: rgba(255, 255, 255, 0.9); font-size: 0.9rem; font-weight: 500;">Celebrity Trusted</div>
                        </div>
                      </div>
                    </div>
                  </section>
                `,
                featuresHTML: `
                  <section style="padding: 6rem 0; background: linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(0,0,0,1) 100%); position: relative;">
                    <!-- Floating background elements -->
                    <div style="position: absolute; top: 20%; left: 10%; width: 100px; height: 100px; background: radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%); border-radius: 50%; filter: blur(60px);"></div>
                    <div style="position: absolute; bottom: 30%; right: 15%; width: 150px; height: 150px; background: radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%); border-radius: 50%; filter: blur(80px);"></div>
                    
                    <div style="max-width: 1200px; margin: 0 auto; padding: 0 3rem; text-align: center;">
                      <div style="margin-bottom: 4rem;">
                        <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 50px; padding: 0.5rem 1.5rem; margin-bottom: 2rem;">
                          <span style="color: #d4af37; font-size: 0.8rem;">👑</span>
                          <span style="color: #d4af37; font-size: 0.8rem; letter-spacing: 1px; font-weight: 500;">EXCLUSIVE SERVICES</span>
                        </div>
                        <h2 style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 300; color: rgba(255, 255, 255, 0.95); margin-bottom: 1rem; font-family: 'Playfair Display', serif;">Curated Experiences</h2>
                        <p style="font-size: 1.2rem; color: rgba(255, 255, 255, 0.7); max-width: 600px; margin: 0 auto;">Where artistry meets luxury in every detail</p>
                      </div>
                      
                      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem; margin-bottom: 4rem;">
                        <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 20px; padding: 3rem 2rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(10px); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.transform='translateY(-8px)'; this.style.borderColor='rgba(212, 175, 55, 0.4)'; this.style.boxShadow='0 20px 40px rgba(212, 175, 55, 0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(212, 175, 55, 0.2)'; this.style.boxShadow='none'">
                          <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #d4af37, #f6e19c); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 8px 30px rgba(212, 175, 55, 0.3);">
                            <span style="font-size: 2rem;">💎</span>
                          </div>
                          <h3 style="font-size: 1.5rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin-bottom: 1rem;">Private Suite Experience</h3>
                          <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 2rem; line-height: 1.6;">Complete privacy and personalized attention in our luxury suites with dedicated stylists and concierge service</p>
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                            <span style="color: #d4af37; font-size: 1.4rem; font-weight: 600;">From $500</span>
                            <button style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); color: #d4af37; padding: 0.5rem 1.5rem; border-radius: 25px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='rgba(212, 175, 55, 0.2)'" onmouseout="this.style.background='rgba(212, 175, 55, 0.1)'">Book Now</button>
                          </div>
                        </div>
                        
                        <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 20px; padding: 3rem 2rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(10px); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.transform='translateY(-8px)'; this.style.borderColor='rgba(212, 175, 55, 0.4)'; this.style.boxShadow='0 20px 40px rgba(212, 175, 55, 0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(212, 175, 55, 0.2)'; this.style.boxShadow='none'">
                          <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #d4af37, #f6e19c); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 8px 30px rgba(212, 175, 55, 0.3);">
                            <span style="font-size: 2rem;">🥂</span>
                          </div>
                          <h3 style="font-size: 1.5rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin-bottom: 1rem;">VIP Concierge Service</h3>
                          <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 2rem; line-height: 1.6;">Personal styling consultant, champagne service, and exclusive access to premium products and treatments</p>
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                            <span style="color: #d4af37; font-size: 1.4rem; font-weight: 600;">Complimentary</span>
                            <button style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); color: #d4af37; padding: 0.5rem 1.5rem; border-radius: 25px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='rgba(212, 175, 55, 0.2)'" onmouseout="this.style.background='rgba(212, 175, 55, 0.1)'">Learn More</button>
                          </div>
                        </div>
                        
                        <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 20px; padding: 3rem 2rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(10px); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.transform='translateY(-8px)'; this.style.borderColor='rgba(212, 175, 55, 0.4)'; this.style.boxShadow='0 20px 40px rgba(212, 175, 55, 0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(212, 175, 55, 0.2)'; this.style.boxShadow='none'">
                          <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #d4af37, #f6e19c); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 8px 30px rgba(212, 175, 55, 0.3);">
                            <span style="font-size: 2rem;">✨</span>
                          </div>
                          <h3 style="font-size: 1.5rem; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin-bottom: 1rem;">Celebrity Stylists</h3>
                          <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 2rem; line-height: 1.6;">Work with award-winning stylists who have crafted looks for A-list celebrities and fashion industry leaders</p>
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                            <span style="color: #d4af37; font-size: 1.4rem; font-weight: 600;">Premium Rates</span>
                            <button style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); color: #d4af37; padding: 0.5rem 1.5rem; border-radius: 25px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.background='rgba(212, 175, 55, 0.2)'" onmouseout="this.style.background='rgba(212, 175, 55, 0.1)'">Inquire</button>
                          </div>
                        </div>
                      </div>
                      
                      <!-- Luxury amenities section -->
                      <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%); border: 1px solid rgba(212, 175, 55, 0.15); border-radius: 20px; padding: 3rem; backdrop-filter: blur(10px);">
                        <h3 style="font-size: 2rem; font-weight: 300; color: rgba(255, 255, 255, 0.95); margin-bottom: 2rem; font-family: 'Playfair Display', serif;">Luxury Amenities</h3>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem;">
                          <div style="text-align: center; padding: 1.5rem;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">🍾</div>
                            <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500;">Champagne Bar</div>
                          </div>
                          <div style="text-align: center; padding: 1.5rem;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">🧘</div>
                            <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500;">Relaxation Lounge</div>
                          </div>
                          <div style="text-align: center; padding: 1.5rem;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">🚿</div>
                            <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500;">Private Spa</div>
                          </div>
                          <div style="text-align: center; padding: 1.5rem;">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">🎭</div>
                            <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500;">VIP Styling</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                `
              },
              // Comprehensive CSS changes with high specificity and animations
              cssOverrides: `
                /* LUXURY THEME - High Specificity Overrides */
                html, body, #__next, [data-theme] {
                  background: radial-gradient(ellipse at center, #0a0a0a 0%, #000000 100%) !important;
                  color: #f5f5f5 !important;
                  font-family: 'Playfair Display', serif !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow-x: hidden !important;
                }
                
                @keyframes gradientShift {
                  0%, 100% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                }
                
                @keyframes shimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
                
                @keyframes float {
                  0%, 100% { transform: translateY(0px); }
                  50% { transform: translateY(-20px); }
                }
                
                @keyframes bounce {
                  0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                  40% { transform: translateY(-10px); }
                  60% { transform: translateY(-5px); }
                }
                
                @keyframes wiggle {
                  0%, 100% { transform: rotate(0deg); }
                  25% { transform: rotate(-5deg); }
                  75% { transform: rotate(5deg); }
                }
                
                .luxury-header, header, nav {
                  background: rgba(0,0,0,0.9) !important;
                  backdrop-filter: blur(10px) !important;
                  padding: 2rem 0 !important;
                  border-bottom: 1px solid #d4af37 !important;
                  position: sticky !important;
                  top: 0 !important;
                  z-index: 1000 !important;
                }
                
                .logo-premium {
                  display: flex;
                  align-items: center;
                  gap: 1rem;
                  font-size: 1.5rem;
                  letter-spacing: 3px;
                  color: #d4af37;
                }
                
                .nav-minimal {
                  display: flex;
                  gap: 3rem;
                  align-items: center;
                }
                
                .nav-link {
                  color: #f5f5f5;
                  text-decoration: none;
                  font-weight: 300;
                  letter-spacing: 1px;
                  transition: color 0.3s;
                }
                
                .gold-cta {
                  background: linear-gradient(135deg, #d4af37, #f6e19c);
                  color: #1a1a1a;
                  padding: 0.75rem 2rem;
                  border-radius: 30px;
                  font-weight: 500;
                }
                
                .hero-luxury {
                  min-height: 90vh;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  position: relative;
                  padding: 4rem 2rem;
                }
                
                .hero-backdrop {
                  position: absolute;
                  inset: 0;
                  background: url('luxury-salon-bg.jpg') center/cover;
                  opacity: 0.3;
                  z-index: -1;
                }
                
                .hero-title-elegant {
                  font-size: 4.5rem;
                  font-weight: 300;
                  line-height: 1.2;
                  margin-bottom: 1rem;
                  background: linear-gradient(135deg, #d4af37, #f6e19c);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                }
                
                .btn-gold, button, .btn {
                  background: linear-gradient(135deg, #d4af37, #f6e19c) !important;
                  color: #1a1a1a !important;
                  border: none !important;
                  padding: 1rem 3rem !important;
                  font-size: 1.1rem !important;
                  border-radius: 50px !important;
                  font-weight: 500 !important;
                  letter-spacing: 1px !important;
                  cursor: pointer !important;
                  transition: transform 0.3s !important;
                  text-decoration: none !important;
                  display: inline-block !important;
                }
                
                .btn-gold:hover {
                  transform: translateY(-2px);
                }
                
                .service-card-premium {
                  background: rgba(212, 175, 55, 0.1);
                  border: 1px solid #d4af37;
                  padding: 3rem;
                  border-radius: 20px;
                  text-align: center;
                  transition: transform 0.3s;
                }
                
                .service-card-premium:hover {
                  transform: translateY(-10px);
                  background: rgba(212, 175, 55, 0.2);
                }
                
                .price-tag {
                  color: #d4af37;
                  font-size: 1.2rem;
                  font-weight: 500;
                }
              `
            }
          }
        },
        {
          id: "warm-approachable", 
          title: "Warm & Approachable",
          description: "Friendly, welcoming atmosphere for the whole community",
          shortDescription: "Friendly & welcoming",
          impactTags: {
            visual: ["warm", "friendly", "colorful"],
            layout: ["cozy", "playful"],
            functionality: ["social", "community"],
            experience: ["casual", "fun"],
            device: ["mobile-first"]
          },
          previewHints: {
            primaryEffect: "warm",
            secondaryEffects: ["playful", "community"],
            targetElements: ["entire-site"],
            complexity: "medium"
          },
          // Enhanced modular preview impact
          modularPreviewImpact: {
            type: "modular-transformation",
            modules: {
              colorScheme: "warm",
              typography: "playful",
              header: {
                component: "playful",
                props: {
                  businessName: "Happy Cuts",
                  subtitle: "YOUR NEIGHBORHOOD SALON",
                  logoIcon: "✂️",
                  navItems: [
                    { label: "Services", emoji: "💇", url: "#" },
                    { label: "Our Team", emoji: "👥", url: "#" },
                    { label: "Book Now", emoji: "📅", url: "#" }
                  ],
                  ctaText: "SPECIAL DEALS!",
                  ctaEmoji: "🎉"
                }
              },
              animations: ["bounce", "wiggle", "float"],
              customCSS: `
                /* Warm theme enhancements */
                .warm-gradient {
                  background: linear-gradient(135deg, #fff9f0 0%, #ffe4cc 50%, #ffd6b8 100%);
                }
                .warm-shadow {
                  box-shadow: 0 10px 30px rgba(255, 107, 107, 0.2);
                }
              `
            }
          },
          // Legacy comprehensive preview for fallback
          comprehensivePreviewImpact: {
            type: "complete-transformation",
            changes: {
              htmlStructure: {
                headerHTML: `
                  <header style="background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 245, 230, 0.9) 100%); backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(255, 107, 107, 0.1); padding: 1.5rem 0; position: sticky; top: 0; z-index: 1000; border-bottom: 3px solid transparent; border-image: linear-gradient(90deg, #ff6b6b, #74b9ff, #00b894) 1;">
                    <div style="max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 0 3rem;">
                      <div style="display: flex; align-items: center; gap: 1.5rem;">
                        <div style="position: relative;">
                          <div style="width: 55px; height: 55px; background: linear-gradient(135deg, #ff6b6b, #ff8787); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3); position: relative; overflow: hidden;">
                            <span style="font-size: 1.8rem; animation: bounce 2s infinite;">✂️</span>
                            <div style="position: absolute; inset: 0; background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.2), transparent); animation: sweep 3s linear infinite;"></div>
                          </div>
                        </div>
                        <div>
                          <div style="font-size: 2rem; font-weight: 800; color: #ff6b6b; font-family: 'Nunito', sans-serif; line-height: 1; letter-spacing: -0.5px;">Happy Cuts</div>
                          <div style="font-size: 0.8rem; color: #74b9ff; font-weight: 600; letter-spacing: 2px; margin-top: 2px;">YOUR NEIGHBORHOOD SALON</div>
                        </div>
                      </div>
                      <nav style="display: flex; gap: 2.5rem; align-items: center;">
                        <a href="#" style="display: flex; align-items: center; gap: 0.5rem; color: #2d3436; text-decoration: none; font-weight: 600; transition: all 0.3s; padding: 0.5rem 1rem; border-radius: 12px;" onmouseover="this.style.background='rgba(255, 107, 107, 0.1)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='transparent'; this.style.transform='translateY(0)'">
                          <span style="font-size: 1.1rem;">💇</span>Services
                        </a>
                        <a href="#" style="display: flex; align-items: center; gap: 0.5rem; color: #2d3436; text-decoration: none; font-weight: 600; transition: all 0.3s; padding: 0.5rem 1rem; border-radius: 12px;" onmouseover="this.style.background='rgba(116, 185, 255, 0.1)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='transparent'; this.style.transform='translateY(0)'">
                          <span style="font-size: 1.1rem;">👥</span>Our Team
                        </a>
                        <a href="#" style="display: flex; align-items: center; gap: 0.5rem; color: #2d3436; text-decoration: none; font-weight: 600; transition: all 0.3s; padding: 0.5rem 1rem; border-radius: 12px;" onmouseover="this.style.background='rgba(0, 184, 148, 0.1)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='transparent'; this.style.transform='translateY(0)'">
                          <span style="font-size: 1.1rem;">📅</span>Book Now
                        </a>
                        <a href="#" style="display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 50%, #ff6b6b 100%); color: white; padding: 0.875rem 2rem; border-radius: 25px; text-decoration: none; font-weight: 700; box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4); transition: all 0.3s; border: 2px solid rgba(255, 255, 255, 0.2);" onmouseover="this.style.transform='translateY(-3px) scale(1.05)'; this.style.boxShadow='0 10px 30px rgba(255, 107, 107, 0.5)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 6px 20px rgba(255, 107, 107, 0.4)'">
                          <span style="font-size: 1.2rem;">🎉</span>SPECIAL DEALS!
                        </a>
                      </nav>
                    </div>
                  </header>
                `,
                heroHTML: `
                  <section style="min-height: 90vh; background: linear-gradient(135deg, #fff9f0 0%, #ffe4cc 50%, #ffd6b8 100%); position: relative; overflow: hidden; display: flex; align-items: center; font-family: 'Nunito', sans-serif;">
                    <!-- Animated background elements -->
                    <div style="position: absolute; top: -20%; right: -10%; width: 400px; height: 400px; background: radial-gradient(circle, rgba(255, 107, 107, 0.15) 0%, transparent 70%); border-radius: 50%; filter: blur(100px); animation: float 6s ease-in-out infinite;"></div>
                    <div style="position: absolute; bottom: -20%; left: -5%; width: 350px; height: 350px; background: radial-gradient(circle, rgba(116, 185, 255, 0.12) 0%, transparent 70%); border-radius: 50%; filter: blur(80px); animation: float 8s ease-in-out infinite reverse;"></div>
                    <div style="position: absolute; top: 50%; left: 50%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(0, 184, 148, 0.1) 0%, transparent 70%); border-radius: 50%; filter: blur(60px); transform: translate(-50%, -50%); animation: float 10s ease-in-out infinite;"></div>
                    
                    <div style="max-width: 1400px; margin: 0 auto; padding: 0 3rem; display: grid; grid-template-columns: 1fr 1fr; gap: 5rem; align-items: center; position: relative; z-index: 10;">
                      <div style="animation: slideInLeft 1s ease-out;">
                        <!-- Welcome badge with animation -->
                        <div style="display: inline-flex; align-items: center; gap: 0.75rem; background: linear-gradient(135deg, #74b9ff, #81c784); color: white; padding: 0.75rem 2rem; border-radius: 50px; font-weight: 700; margin-bottom: 2rem; box-shadow: 0 8px 25px rgba(116, 185, 255, 0.3); animation: bounce 2s infinite;">
                          <span style="font-size: 1.2rem;">🌟</span>
                          <span style="letter-spacing: 1px;">WELCOME TO HAPPY CUTS</span>
                        </div>
                        
                        <!-- Enhanced main headline -->
                        <h1 style="font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 900; line-height: 1.1; color: #2d3436; margin-bottom: 1.5rem; font-family: 'Nunito', sans-serif; position: relative;">
                          <span style="background: linear-gradient(135deg, #ff6b6b, #ff8787, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: block;">Your Happy Place</span>
                          <span style="background: linear-gradient(135deg, #74b9ff, #81c784, #74b9ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: block;">for Happy Hair!</span>
                          <span style="font-size: 3rem; position: absolute; right: -1rem; top: 0; animation: wiggle 2s ease-in-out infinite;">💕</span>
                        </h1>
                        
                        <!-- Enhanced subtitle -->
                        <p style="font-size: 1.4rem; color: #636e72; margin-bottom: 2.5rem; line-height: 1.6; font-weight: 500;">Where families create beautiful memories together, one smile at a time</p>
                        
                        <!-- Enhanced CTA buttons -->
                        <div style="display: flex; gap: 1.5rem; margin-bottom: 3rem; flex-wrap: wrap;">
                          <button style="background: linear-gradient(135deg, #ff6b6b 0%, #ff8787 50%, #ff6b6b 100%); color: white; border: none; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 800; cursor: pointer; box-shadow: 0 8px 30px rgba(255, 107, 107, 0.4); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-4px) scale(1.05)'; this.style.boxShadow='0 15px 40px rgba(255, 107, 107, 0.5)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 30px rgba(255, 107, 107, 0.4)'">
                            <span style="position: relative; z-index: 2;">📅 BOOK YOUR VISIT</span>
                          </button>
                          <button style="border: 3px solid #ff6b6b; background: rgba(255, 255, 255, 0.9); color: #ff6b6b; padding: 1.25rem 3rem; font-size: 1.2rem; border-radius: 50px; font-weight: 800; cursor: pointer; backdrop-filter: blur(10px); transition: all 0.4s;" onmouseover="this.style.background='#ff6b6b'; this.style.color='white'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.color='#ff6b6b'; this.style.transform='translateY(0)'">🎉 TODAY'S SPECIALS</button>
                        </div>
                        
                        <!-- Enhanced trust indicators -->
                        <div style="space-y: 1rem;">
                          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                            <div style="display: flex; gap: 0.25rem;">⭐⭐⭐⭐⭐</div>
                            <span style="font-weight: 700; color: #2d3436;">4.9/5 from 500+ Happy Families</span>
                          </div>
                          <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem 1.5rem; background: rgba(0, 184, 148, 0.1); border-radius: 15px; border: 2px solid rgba(0, 184, 148, 0.2);">
                            <span style="font-size: 1.5rem;">🏆</span>
                            <span style="color: #00b894; font-weight: 800; font-size: 1.2rem;">BEST FAMILY SALON 2024</span>
                          </div>
                        </div>
                      </div>
                      
                      <!-- Enhanced right side grid -->
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; animation: slideInRight 1s ease-out;">
                        <div style="background: linear-gradient(135deg, #ff6b6b, #ff8787); color: white; padding: 2.5rem 1.5rem; border-radius: 25px; text-align: center; font-weight: 800; box-shadow: 0 10px 30px rgba(255, 107, 107, 0.3); transition: all 0.3s; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-5px) scale(1.02)'; this.style.boxShadow='0 15px 40px rgba(255, 107, 107, 0.4)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 10px 30px rgba(255, 107, 107, 0.3)'">
                          <div style="font-size: 3rem; margin-bottom: 1rem;">👨‍👩‍👧‍👦</div>
                          <div style="font-size: 1.1rem; letter-spacing: 0.5px;">FAMILY PACKAGES</div>
                          <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 0.5rem;">Save up to 30%</div>
                        </div>
                        
                        <div style="background: linear-gradient(135deg, #74b9ff, #81c784); color: white; padding: 2.5rem 1.5rem; border-radius: 25px; text-align: center; font-weight: 800; box-shadow: 0 10px 30px rgba(116, 185, 255, 0.3); transition: all 0.3s; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-5px) scale(1.02)'; this.style.boxShadow='0 15px 40px rgba(116, 185, 255, 0.4)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 10px 30px rgba(116, 185, 255, 0.3)'">
                          <div style="font-size: 3rem; margin-bottom: 1rem;">🎨</div>
                          <div style="font-size: 1.1rem; letter-spacing: 0.5px;">KIDS CORNER</div>
                          <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 0.5rem;">Fun & Safe</div>
                        </div>
                        
                        <div style="background: linear-gradient(135deg, #00b894, #26d0ce); color: white; padding: 2.5rem 1.5rem; border-radius: 25px; text-align: center; font-weight: 800; box-shadow: 0 10px 30px rgba(0, 184, 148, 0.3); transition: all 0.3s; grid-column: span 2; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-5px) scale(1.02)'; this.style.boxShadow='0 15px 40px rgba(0, 184, 148, 0.4)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 10px 30px rgba(0, 184, 148, 0.3)'">
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem;">
                            <span style="font-size: 3rem;">☕</span>
                            <div>
                              <div style="font-size: 1.3rem; letter-spacing: 0.5px;">FREE COFFEE BAR & TREATS</div>
                              <div style="font-size: 1rem; opacity: 0.9;">Relax while we work our magic</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                `,
                featuresHTML: `
                  <section style="padding: 6rem 0; background: linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 245, 230, 0.9) 100%); position: relative;">
                    <!-- Floating background elements -->
                    <div style="position: absolute; top: 10%; right: 5%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(255, 107, 107, 0.1) 0%, transparent 70%); border-radius: 50%; filter: blur(80px); animation: float 8s ease-in-out infinite;"></div>
                    <div style="position: absolute; bottom: 20%; left: 10%; width: 150px; height: 150px; background: radial-gradient(circle, rgba(116, 185, 255, 0.08) 0%, transparent 70%); border-radius: 50%; filter: blur(60px); animation: float 6s ease-in-out infinite reverse;"></div>
                    
                    <div style="max-width: 1200px; margin: 0 auto; padding: 0 3rem; text-align: center;">
                      <!-- Section header -->
                      <div style="margin-bottom: 4rem;">
                        <div style="display: inline-flex; align-items: center; gap: 0.75rem; background: linear-gradient(135deg, #ff6b6b, #ff8787); color: white; padding: 0.75rem 2rem; border-radius: 50px; font-weight: 700; margin-bottom: 2rem; box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3);">
                          <span style="font-size: 1.2rem;">🌟</span>
                          <span style="letter-spacing: 1px;">WHAT MAKES US SPECIAL</span>
                        </div>
                        <h2 style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 900; color: #2d3436; margin-bottom: 1rem; font-family: 'Nunito', sans-serif;">
                          <span style="background: linear-gradient(135deg, #ff6b6b, #74b9ff, #00b894); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Why Families Choose Us!</span>
                        </h2>
                        <p style="font-size: 1.3rem; color: #636e72; max-width: 600px; margin: 0 auto;">Creating beautiful moments for your entire family</p>
                      </div>
                      
                      <!-- Enhanced features grid -->
                      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem; margin-bottom: 4rem;">
                        <div style="background: rgba(255, 255, 255, 0.9); border: 3px solid rgba(255, 107, 107, 0.2); border-radius: 25px; padding: 3rem 2rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(10px); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 30px rgba(255, 107, 107, 0.1);" onmouseover="this.style.transform='translateY(-8px) scale(1.02)'; this.style.borderColor='rgba(255, 107, 107, 0.4)'; this.style.boxShadow='0 20px 40px rgba(255, 107, 107, 0.2)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.borderColor='rgba(255, 107, 107, 0.2)'; this.style.boxShadow='0 10px 30px rgba(255, 107, 107, 0.1)'">
                          <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #ff6b6b, #ff8787); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 15px 30px rgba(255, 107, 107, 0.3); position: relative;">
                            <span style="font-size: 3rem; animation: bounce 2s infinite;">👨‍👩‍👧‍👦</span>
                          </div>
                          <h3 style="font-size: 1.8rem; font-weight: 800; color: #2d3436; margin-bottom: 1rem;">Family Packages</h3>
                          <p style="color: #636e72; margin-bottom: 2rem; line-height: 1.6; font-size: 1.1rem;">Special deals designed for families! Bring everyone and save big while creating beautiful memories together.</p>
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1rem;">
                            <span style="color: #ff6b6b; font-size: 1.6rem; font-weight: 800;">Starting at $99</span>
                            <span style="background: #00b894; color: white; padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem; font-weight: 700;">Save 30%!</span>
                          </div>
                          <button style="background: linear-gradient(135deg, #ff6b6b, #ff8787); color: white; border: none; padding: 0.75rem 2rem; border-radius: 25px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 5px 15px rgba(255, 107, 107, 0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(255, 107, 107, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 5px 15px rgba(255, 107, 107, 0.3)'">Book Family Package</button>
                        </div>
                        
                        <div style="background: rgba(255, 255, 255, 0.9); border: 3px solid rgba(116, 185, 255, 0.2); border-radius: 25px; padding: 3rem 2rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(10px); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 30px rgba(116, 185, 255, 0.1);" onmouseover="this.style.transform='translateY(-8px) scale(1.02)'; this.style.borderColor='rgba(116, 185, 255, 0.4)'; this.style.boxShadow='0 20px 40px rgba(116, 185, 255, 0.2)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.borderColor='rgba(116, 185, 255, 0.2)'; this.style.boxShadow='0 10px 30px rgba(116, 185, 255, 0.1)'">
                          <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #74b9ff, #81c784); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 15px 30px rgba(116, 185, 255, 0.3); position: relative;">
                            <span style="font-size: 3rem; animation: wiggle 2s ease-in-out infinite;">🎨</span>
                          </div>
                          <h3 style="font-size: 1.8rem; font-weight: 800; color: #2d3436; margin-bottom: 1rem;">Kids Corner</h3>
                          <p style="color: #636e72; margin-bottom: 2rem; line-height: 1.6; font-size: 1.1rem;">Safe, fun play area with toys, games, and special kid-friendly styling chairs. Making haircuts an adventure!</p>
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1rem;">
                            <span style="color: #74b9ff; font-size: 1.6rem; font-weight: 800;">Kids cuts $15</span>
                            <span style="background: #ff6b6b; color: white; padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem; font-weight: 700;">Under 12</span>
                          </div>
                          <button style="background: linear-gradient(135deg, #74b9ff, #81c784); color: white; border: none; padding: 0.75rem 2rem; border-radius: 25px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 5px 15px rgba(116, 185, 255, 0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(116, 185, 255, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 5px 15px rgba(116, 185, 255, 0.3)'">Book Kids Cut</button>
                        </div>
                        
                        <div style="background: rgba(255, 255, 255, 0.9); border: 3px solid rgba(0, 184, 148, 0.2); border-radius: 25px; padding: 3rem 2rem; text-align: center; position: relative; overflow: hidden; backdrop-filter: blur(10px); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 10px 30px rgba(0, 184, 148, 0.1);" onmouseover="this.style.transform='translateY(-8px) scale(1.02)'; this.style.borderColor='rgba(0, 184, 148, 0.4)'; this.style.boxShadow='0 20px 40px rgba(0, 184, 148, 0.2)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.borderColor='rgba(0, 184, 148, 0.2)'; this.style.boxShadow='0 10px 30px rgba(0, 184, 148, 0.1)'">
                          <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #00b894, #26d0ce); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 15px 30px rgba(0, 184, 148, 0.3); position: relative;">
                            <span style="font-size: 3rem; animation: bounce 2s infinite;">☕</span>
                          </div>
                          <h3 style="font-size: 1.8rem; font-weight: 800; color: #2d3436; margin-bottom: 1rem;">Free Coffee Bar</h3>
                          <p style="color: #636e72; margin-bottom: 2rem; line-height: 1.6; font-size: 1.1rem;">Complimentary coffee, tea, pastries and treats while you relax. Free Wi-Fi too!</p>
                          <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1rem;">
                            <span style="color: #00b894; font-size: 1.6rem; font-weight: 800;">Always Free!</span>
                            <span style="background: #74b9ff; color: white; padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem; font-weight: 700;">Premium Coffee</span>
                          </div>
                          <button style="background: linear-gradient(135deg, #00b894, #26d0ce); color: white; border: none; padding: 0.75rem 2rem; border-radius: 25px; font-weight: 700; cursor: pointer; transition: all 0.3s; box-shadow: 0 5px 15px rgba(0, 184, 148, 0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0, 184, 148, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 5px 15px rgba(0, 184, 148, 0.3)'">Try Our Coffee</button>
                        </div>
                      </div>
                      
                      <!-- Enhanced community section -->
                      <div style="background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 240, 225, 0.9) 100%); border: 3px solid rgba(255, 107, 107, 0.2); border-radius: 25px; padding: 3rem; backdrop-filter: blur(10px); box-shadow: 0 15px 40px rgba(255, 107, 107, 0.1);">
                        <h3 style="font-size: 2.5rem; font-weight: 900; color: #2d3436; margin-bottom: 2rem; font-family: 'Nunito', sans-serif;">
                          <span style="background: linear-gradient(135deg, #ff6b6b, #74b9ff, #00b894); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Join Our Happy Community! 🎉</span>
                        </h3>
                        <p style="font-size: 1.2rem; color: #636e72; margin-bottom: 3rem; max-width: 600px; margin-left: auto; margin-right: auto;">Be part of our growing family and enjoy exclusive perks, special events, and amazing savings!</p>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem;">
                          <div style="background: rgba(255, 107, 107, 0.1); border: 2px solid rgba(255, 107, 107, 0.2); border-radius: 20px; padding: 2rem; text-align: center; transition: all 0.3s;" onmouseover="this.style.transform='translateY(-5px)'; this.style.borderColor='rgba(255, 107, 107, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(255, 107, 107, 0.2)'">
                            <div style="font-size: 2.5rem; margin-bottom: 1rem;">💳</div>
                            <h4 style="font-size: 1.3rem; font-weight: 800; color: #2d3436; margin-bottom: 0.5rem;">Loyalty Rewards</h4>
                            <p style="color: #636e72; font-size: 1rem;">Earn points on every visit!</p>
                          </div>
                          
                          <div style="background: rgba(116, 185, 255, 0.1); border: 2px solid rgba(116, 185, 255, 0.2); border-radius: 20px; padding: 2rem; text-align: center; transition: all 0.3s;" onmouseover="this.style.transform='translateY(-5px)'; this.style.borderColor='rgba(116, 185, 255, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(116, 185, 255, 0.2)'">
                            <div style="font-size: 2.5rem; margin-bottom: 1rem;">🎂</div>
                            <h4 style="font-size: 1.3rem; font-weight: 800; color: #2d3436; margin-bottom: 0.5rem;">Birthday Specials</h4>
                            <p style="color: #636e72; font-size: 1rem;">Free birthday cut + treats!</p>
                          </div>
                          
                          <div style="background: rgba(0, 184, 148, 0.1); border: 2px solid rgba(0, 184, 148, 0.2); border-radius: 20px; padding: 2rem; text-align: center; transition: all 0.3s;" onmouseover="this.style.transform='translateY(-5px)'; this.style.borderColor='rgba(0, 184, 148, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(0, 184, 148, 0.2)'">
                            <div style="font-size: 2.5rem; margin-bottom: 1rem;">👫</div>
                            <h4 style="font-size: 1.3rem; font-weight: 800; color: #2d3436; margin-bottom: 0.5rem;">Refer a Friend</h4>
                            <p style="color: #636e72; font-size: 1rem;">Both get 25% off next visit!</p>
                          </div>
                        </div>
                        
                        <div style="margin-top: 3rem;">
                          <button style="background: linear-gradient(135deg, #ff6b6b, #ff8787); color: white; border: none; padding: 1.25rem 3rem; font-size: 1.3rem; border-radius: 50px; font-weight: 800; cursor: pointer; box-shadow: 0 8px 30px rgba(255, 107, 107, 0.3); transition: all 0.4s; letter-spacing: 1px;" onmouseover="this.style.transform='translateY(-4px) scale(1.05)'; this.style.boxShadow='0 15px 40px rgba(255, 107, 107, 0.4)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 30px rgba(255, 107, 107, 0.3)'">
                            🌟 JOIN THE COMMUNITY TODAY!
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                `
              },
              cssOverrides: `
                /* WARM & FRIENDLY THEME - High Specificity Overrides */
                html, body, #__next, [data-theme] {
                  background: linear-gradient(135deg, #fff5e6 0%, #ffe0cc 100%) !important;
                  color: #2d3436 !important;
                  font-family: 'Nunito', 'Arial', sans-serif !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                
                @keyframes bounce {
                  0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
                  40% { transform: translateY(-10px); }
                  60% { transform: translateY(-5px); }
                }
                
                @keyframes wiggle {
                  0%, 100% { transform: rotate(0deg); }
                  25% { transform: rotate(-5deg); }
                  75% { transform: rotate(5deg); }
                }
                
                @keyframes float {
                  0%, 100% { transform: translateY(0px); }
                  50% { transform: translateY(-15px); }
                }
                
                @keyframes slideInLeft {
                  from { opacity: 0; transform: translateX(-50px); }
                  to { opacity: 1; transform: translateX(0); }
                }
                
                @keyframes slideInRight {
                  from { opacity: 0; transform: translateX(50px); }
                  to { opacity: 1; transform: translateX(0); }
                }
                
                @keyframes sweep {
                  0% { transform: translateX(-100%) skewX(-15deg); }
                  100% { transform: translateX(200%) skewX(-15deg); }
                }
                
                .friendly-header, header, nav {
                  background: white !important;
                  box-shadow: 0 2px 20px rgba(0,0,0,0.1) !important;
                  padding: 1rem 0 !important;
                  position: sticky !important;
                  top: 0 !important;
                  z-index: 100 !important;
                }
                
                button, .btn, .btn-primary-fun {
                  background: linear-gradient(135deg, #ff6b6b, #ff8787) !important;
                  color: white !important;
                  border: none !important;
                  padding: 1rem 2.5rem !important;
                  font-size: 1.1rem !important;
                  border-radius: 30px !important;
                  font-weight: 700 !important;
                  cursor: pointer !important;
                  box-shadow: 0 5px 20px rgba(255, 107, 107, 0.3) !important;
                  transition: all 0.3s !important;
                  text-decoration: none !important;
                  display: inline-block !important;
                }
                
                .logo-fun {
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  font-size: 1.5rem;
                  font-weight: 800;
                  color: #ff6b6b;
                }
                
                .logo-icon {
                  font-size: 2rem;
                  animation: bounce 2s infinite;
                }
                
                .tagline {
                  font-size: 0.9rem;
                  color: #74b9ff;
                  font-weight: 400;
                  margin-left: 0.5rem;
                }
                
                .nav-friendly {
                  display: flex;
                  gap: 2rem;
                  align-items: center;
                }
                
                .nav-item {
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  color: #2d3436;
                  text-decoration: none;
                  font-weight: 600;
                  transition: transform 0.2s;
                }
                
                .nav-item:hover {
                  transform: translateY(-2px);
                  color: #ff6b6b;
                }
                
                .nav-item.highlight {
                  background: linear-gradient(135deg, #ff6b6b, #ff8787);
                  color: white;
                  padding: 0.5rem 1.5rem;
                  border-radius: 25px;
                }
                
                .hero-friendly {
                  padding: 4rem 2rem;
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 4rem;
                  align-items: center;
                  min-height: 80vh;
                }
                
                .welcome-badge {
                  display: inline-block;
                  background: #74b9ff;
                  color: white;
                  padding: 0.5rem 1.5rem;
                  border-radius: 20px;
                  font-weight: 600;
                  margin-bottom: 1rem;
                }
                
                .hero-title-playful {
                  font-size: 3.5rem;
                  font-weight: 800;
                  line-height: 1.2;
                  color: #2d3436;
                  margin-bottom: 1rem;
                }
                
                .hero-subtitle-warm {
                  font-size: 1.3rem;
                  color: #636e72;
                  margin-bottom: 2rem;
                }
                
                .btn-primary-fun {
                  background: linear-gradient(135deg, #ff6b6b, #ff8787);
                  color: white;
                  border: none;
                  padding: 1rem 2.5rem;
                  font-size: 1.1rem;
                  border-radius: 30px;
                  font-weight: 700;
                  cursor: pointer;
                  box-shadow: 0 5px 20px rgba(255, 107, 107, 0.3);
                  transition: all 0.3s;
                }
                
                .btn-primary-fun:hover {
                  transform: translateY(-2px);
                  box-shadow: 0 8px 25px rgba(255, 107, 107, 0.4);
                }
                
                .feature-card-fun {
                  background: white;
                  padding: 2rem;
                  border-radius: 20px;
                  text-align: center;
                  box-shadow: 0 5px 20px rgba(0,0,0,0.1);
                  transition: all 0.3s;
                }
                
                .feature-card-fun:hover {
                  transform: translateY(-5px);
                  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                }
                
                .feature-emoji {
                  font-size: 3rem;
                  margin-bottom: 1rem;
                }
                
                .price-friendly {
                  color: #00b894;
                  font-weight: 700;
                  font-size: 1.2rem;
                }
                
                @keyframes bounce {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-10px); }
                }
              `
            }
          }
        }
      ]
    }
  ],
  metadata: {
    stage: "foundation",
    estimatedCompletion: 25,
    nextRecommendedCategories: ["business-features", "technical-approach"],
    qualityScore: 95
  }
}