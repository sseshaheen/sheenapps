import { RobustJSONParser } from './json-parser'
import { logger } from '@/utils/logger';

// Test cases for common AI response formats
export function testJSONParser() {
  logger.info('🧪 Testing Robust JSON Parser...');
  
  // Test 1: Valid JSON
  try {
    const test1 = '{"name": "Test Business", "type": "saas"}'
    const result1 = RobustJSONParser.parse(test1)
    logger.info('✅ Test 1 (Valid JSON);:', result1)
  } catch (error) {
    logger.error('❌ Test 1 failed:', error);
  }

  // Test 2: JSON with markdown code blocks
  try {
    const test2 = `Here's your JSON response:

\`\`\`json
{
  "name": "SalonBooking Pro",
  "reasoning": "Combines salon focus with professional branding",
  "brandFit": 0.92
}
\`\`\`

This name works well because...`
    
    const result2 = RobustJSONParser.parse(test2)
    logger.info('✅ Test 2 (Markdown blocks);:', result2)
  } catch (error) {
    logger.error('❌ Test 2 failed:', error);
  }

  // Test 3: JSON array with markdown
  try {
    const test3 = `\`\`\`json
[
  {
    "name": "BeautyFlow",
    "reasoning": "Suggests smooth appointment flow",
    "brandFit": 0.88
  },
  {
    "name": "SalonSync",
    "reasoning": "Indicates synchronized scheduling",
    "brandFit": 0.91
  }
]
\`\`\``
    
    const result3 = RobustJSONParser.parse(test3)
    logger.info('✅ Test 3 (JSON Array with markdown);:', result3)
  } catch (error) {
    logger.error('❌ Test 3 failed:', error);
  }

  // Test 4: JSON with trailing commas (common AI mistake)
  try {
    const test4 = `{
  "name": "SalonHub",
  "reasoning": "Central hub for salon operations",
  "brandFit": 0.85,
}`
    
    const result4 = RobustJSONParser.parse(test4)
    logger.info('✅ Test 4 (Trailing commas);:', result4)
  } catch (error) {
    logger.error('❌ Test 4 failed:', error);
  }

  // Test 5: Mixed with explanatory text
  try {
    const test5 = `Here are some great business names for your salon booking system:

{
  "name": "AppointmentAce",
  "reasoning": "Ace suggests expertise in appointments",
  "brandFit": 0.89
}

I hope this helps with your business naming!`
    
    const result5 = RobustJSONParser.parse(test5)
    logger.info('✅ Test 5 (Mixed with text);:', result5)
  } catch (error) {
    logger.error('❌ Test 5 failed:', error);
  }

  logger.info('🧪 JSON Parser testing complete!');
}

// Uncomment to run tests
// testJSONParser()