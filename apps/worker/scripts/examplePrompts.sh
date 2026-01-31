#!/bin/bash

# Example scripts showing how to handle prompts with quotes and special characters

echo "🧪 Claude Worker Test Examples - Handling Complex Prompts"
echo "========================================================"

# Example 1: Using a file
echo -e "\n📄 Example 1: Prompt from file"
echo "--------------------------------"
cat > /tmp/test-prompt.txt << 'EOF'
Create a React app with:
- A header that says "Welcome to Our App"
- A button with text 'Click Me!'
- A JSON config like: {"theme": "dark", "title": "My \"Special\" App"}
- CSS with content: content: "Quote's here";
EOF

echo "Command: npm run test:worker --prompt-file /tmp/test-prompt.txt"
echo "Prompt content:"
cat /tmp/test-prompt.txt

# Example 2: Using stdin with echo
echo -e "\n📝 Example 2: Simple prompt with quotes via stdin"
echo "------------------------------------------------"
echo 'Command: echo "Create a site with a button that says \"Click Me\" and a title '\''My Site'\''" | npm run test:worker --prompt-file -'

# Example 3: Using heredoc (recommended for complex prompts)
echo -e "\n📋 Example 3: Complex prompt with heredoc (RECOMMENDED)"
echo "-----------------------------------------------------"
cat << 'EXAMPLE'
npm run test:worker --prompt-file - <<'EOF'
SYSTEM:
You are creating a React component with these requirements:
- The header should say "Welcome to Our 'Amazing' Site"
- Include a button with onClick={() => alert("Hello \"World\"!")}
- Add CSS with: font-family: 'Arial', "Helvetica Neue", sans-serif;
- Include a JSON config:
  {
    "title": "My App's Config",
    "theme": {
      "primary": "#123456",
      "quotes": "This has \"nested\" quotes and 'single' ones"
    }
  }
EOF
EXAMPLE

# Example 4: Using process substitution
echo -e "\n🔧 Example 4: Using process substitution"
echo "---------------------------------------"
echo 'Command: npm run test:worker --prompt-file <(echo "Create a component with '\''quotes'\'' and \"double quotes\"")'

# Example 5: Escaping for direct --prompt usage
echo -e "\n⚠️  Example 5: Direct --prompt with escaping (NOT RECOMMENDED)"
echo "------------------------------------------------------------"
echo 'Command: npm run test:worker --prompt "Create a button that says '\''Click Me'\'' and shows \"Hello\""'
echo "(This requires careful escaping - file input is preferred)"

# Example 6: Full template generation prompt
echo -e "\n🚀 Example 6: Full Claude template prompt"
echo "----------------------------------------"
cat << 'TEMPLATE_EXAMPLE'
# Save this to template-prompt.txt:
cat > template-prompt.txt << 'EOF'
SYSTEM:
You are TemplateGen-Vite-Seed. Create a SaaS landing page with:
- Hero section with headline "Transform Your Business Today"
- CTA button: 'Start Free Trial'
- Testimonial: "This product changed our workflow!" - Jane D.
- Pricing card with: {"plan": "Pro", "price": "$99/mo", "features": ["Feature 1", "Feature 2"]}

REACT RULES:
1. Components must use: export default function ComponentName() {}
2. Strings with quotes: use template literals `Welcome to "Our Site"`
3. JSON in JSX: <div data-config={JSON.stringify({"key": "value"})} />

USER SPEC:
Create a modern SaaS landing page with the above requirements.
EOF

# Then run:
npm run test:worker --prompt-file template-prompt.txt
TEMPLATE_EXAMPLE

echo -e "\n✅ Tips for handling quotes in prompts:"
echo "1. Use --prompt-file with heredoc (<<'EOF') for complex prompts"
echo "2. The 'EOF' quotes prevent shell interpretation"
echo "3. Store prompts in files for reusability"
echo "4. Avoid direct --prompt with complex content"

# Cleanup
rm -f /tmp/test-prompt.txt