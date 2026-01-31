const crypto = require('crypto');

const secret = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';
const payload = '{"userId":"test-user-modular","projectId":"test-project-modular","prompt":"Create a simple landing page with a hero section and a contact form"}';

// Generate signature the same way the server does
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

console.log('Secret:', secret);
console.log('Payload:', payload);
console.log('Generated signature:', signature);
console.log('\nThis should match the server\'s expected signature');