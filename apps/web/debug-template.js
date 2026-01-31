// Quick debug script to test template generation
const { MockAIService } = require('./src/services/ai/mock-service.ts');

const mockService = new MockAIService();

// Test spec block that should trigger salon template
const testSpec = {
  goal: "Create a salon booking system for appointments",
  industry: "beauty",
  description: "A booking system for a beauty salon"
};

console.log('Testing salon template generation...');

mockService.generateProjectFromSpec(testSpec, 'mock-premium')
  .then(result => {
    console.log('Template generated successfully:');
    console.log('Has templateData:', !!result.data);
    console.log('Components:', result.data?.metadata?.components ? Object.keys(result.data.metadata.components) : 'No components');
    
    // Check if Hero has tsx source
    const heroComponent = result.data?.metadata?.components?.Hero;
    console.log('Hero component:');
    console.log('- Has propsSchema:', !!heroComponent?.propsSchema);
    console.log('- Has tsx:', !!heroComponent?.tsx);
    console.log('- TSX length:', heroComponent?.tsx?.length || 0);
    
    if (heroComponent?.tsx) {
      console.log('- TSX preview:', heroComponent.tsx.substring(0, 100) + '...');
    }
  })
  .catch(err => {
    console.error('Error:', err);
  });