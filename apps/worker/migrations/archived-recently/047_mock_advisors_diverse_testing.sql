-- =====================================================
-- Migration 047: Mock Advisors for Diverse Testing
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 27, 2025
-- Purpose: Create 24 diverse mock advisors for frontend testing
-- Dependencies: Migration 045 (advisor network) + 046 (phase 2 applications)
-- Status: Creates realistic approved advisor profiles
--
-- Geographic Distribution:
-- - Egypt (8): Cairo, Alexandria, Giza, Aswan
-- - Saudi Arabia (6): Riyadh, Jeddah, Mecca, Medina  
-- - India (6): Mumbai, Bangalore, Delhi, Hyderabad
-- - Others (4): Dubai, Amman, Casablanca, Karachi
-- =====================================================

-- Generate a random admin user ID for approvals
DO $$
DECLARE
  admin_user_id uuid := gen_random_uuid();
  advisor_count int := 0;
  current_advisor_id uuid;
BEGIN
  
  -- Create an admin user first (for approved_by references)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, 
    raw_user_meta_data, created_at
  ) VALUES (
    admin_user_id,
    'admin@sheenapps.com',
    crypt('admin123!', gen_salt('bf')),
    now() - interval '30 days',
    '{"full_name": "Admin User", "role": "admin"}'::jsonb,
    now() - interval '30 days'
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✅ Created admin user: %', admin_user_id;

  -- =====================================================
  -- Egyptian Advisors (8)
  -- =====================================================
  
  -- Ahmed Hassan - Senior Fullstack (Cairo)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'ahmed.hassan@example.com',
    crypt('password123', gen_salt('bf')), 
    now() - interval '60 days',
    '{"full_name": "Ahmed Hassan", "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"}'::jsonb,
    now() - interval '60 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Ahmed Hassan',
    'Senior fullstack developer with 8+ years experience in React, Node.js, and MongoDB. Specialized in e-commerce platforms and fintech solutions. Fluent in Arabic and English.',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    ARRAY['React', 'Node.js', 'MongoDB', 'TypeScript', 'AWS', 'Docker'],
    ARRAY['fullstack', 'ecommerce', 'fintech'],
    ARRAY['Arabic', 'English'],
    4.8, 23,
    'approved', 'EG', admin_user_id, now() - interval '45 days',
    true, 'https://cal.com/ahmed-hassan/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '50 days', now() - interval '45 days',
    now() - interval '60 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  -- Fatima El-Sayed - Frontend React Specialist (Alexandria)  
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'fatima.elsayed@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '45 days', 
    '{"full_name": "Fatima El-Sayed", "avatar_url": "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150"}'::jsonb,
    now() - interval '45 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Fatima El-Sayed',
    'Frontend developer specializing in React and modern CSS frameworks. Expert in responsive design and user experience optimization. Based in Alexandria, Egypt.',
    'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150',
    ARRAY['React', 'Vue.js', 'Tailwind CSS', 'Figma', 'JavaScript', 'SASS'],
    ARRAY['frontend', 'ui/ux'],
    ARRAY['Arabic', 'English'],
    4.9, 31,
    'approved', 'EG', admin_user_id, now() - interval '30 days',
    true, 'https://cal.com/fatima-elsayed/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '35 days', now() - interval '30 days',
    now() - interval '45 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Mohamed Farouk - Backend Python Expert (Cairo)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at  
  ) VALUES (
    gen_random_uuid(),
    'mohamed.farouk@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '55 days',
    '{"full_name": "Mohamed Farouk", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150"}'::jsonb,
    now() - interval '55 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Mohamed Farouk',
    'Backend engineer with expertise in Python, Django, and PostgreSQL. Experienced in building scalable APIs and microservices architecture. Cairo-based with 6 years experience.',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    ARRAY['Python', 'Django', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes'],
    ARRAY['backend', 'api', 'devops'],
    ARRAY['Arabic', 'English'],
    4.7, 18,
    'approved', 'EG', admin_user_id, now() - interval '40 days',
    true, 'https://cal.com/mohamed-farouk/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '45 days', now() - interval '40 days',
    now() - interval '55 days', now() - interval '3 days'
  );
  advisor_count := advisor_count + 1;

  -- Yasmin Abdel-Rahman - Mobile Flutter Developer (Giza)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'yasmin.abdelrahman@example.com', 
    crypt('password123', gen_salt('bf')),
    now() - interval '40 days',
    '{"full_name": "Yasmin Abdel-Rahman", "avatar_url": "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150"}'::jsonb,
    now() - interval '40 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Yasmin Abdel-Rahman',
    'Mobile app developer specializing in Flutter and native iOS development. Created 15+ apps for startups and enterprises. Based in Giza with focus on fintech and healthcare apps.',
    'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150',
    ARRAY['Flutter', 'Dart', 'Swift', 'Firebase', 'REST APIs', 'Git'],
    ARRAY['mobile', 'fintech', 'healthcare'],
    ARRAY['Arabic', 'English'],
    4.6, 14,
    'approved', 'EG', admin_user_id, now() - interval '25 days',
    true, 'https://cal.com/yasmin-abdel/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '30 days', now() - interval '25 days',
    now() - interval '40 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  -- Omar Khalil - DevOps Engineer (Cairo)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'omar.khalil@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '50 days',
    '{"full_name": "Omar Khalil", "avatar_url": "https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=150"}'::jsonb,
    now() - interval '50 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Omar Khalil',
    'DevOps engineer with 7 years experience in AWS, Kubernetes, and CI/CD pipelines. Specialized in infrastructure automation and cloud architecture for high-traffic applications.',
    'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=150',
    ARRAY['AWS', 'Kubernetes', 'Docker', 'Jenkins', 'Terraform', 'Linux'],
    ARRAY['devops', 'cloud', 'infrastructure'],
    ARRAY['Arabic', 'English'],
    4.9, 27,
    'approved', 'EG', admin_user_id, now() - interval '35 days',
    true, 'https://cal.com/omar-khalil/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '40 days', now() - interval '35 days',
    now() - interval '50 days', now() - interval '4 days'
  );
  advisor_count := advisor_count + 1;

  -- Nour Mansour - UI/UX Designer & Frontend (Alexandria)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'nour.mansour@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '35 days',
    '{"full_name": "Nour Mansour", "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150"}'::jsonb,
    now() - interval '35 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Nour Mansour',
    'UI/UX designer and frontend developer combining design thinking with technical implementation. Expert in Figma, Adobe Creative Suite, and modern CSS frameworks.',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    ARRAY['Figma', 'Adobe XD', 'React', 'CSS3', 'JavaScript', 'Sketch'],
    ARRAY['ui/ux', 'frontend', 'design'],
    ARRAY['Arabic', 'English'],
    4.8, 21,
    'approved', 'EG', admin_user_id, now() - interval '20 days',
    true, 'https://cal.com/nour-mansour/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '25 days', now() - interval '20 days',
    now() - interval '35 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Hassan Abdalla - Data Engineer (Aswan)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'hassan.abdalla@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '42 days',
    '{"full_name": "Hassan Abdalla", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150"}'::jsonb,
    now() - interval '42 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Hassan Abdalla',
    'Data engineer and analytics specialist with expertise in Python, Apache Spark, and machine learning pipelines. Experience with large-scale data processing and business intelligence.',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    ARRAY['Python', 'Apache Spark', 'SQL', 'Pandas', 'Machine Learning', 'Tableau'],
    ARRAY['data', 'ai/ml', 'analytics'],
    ARRAY['Arabic', 'English'],
    4.7, 16,
    'approved', 'EG', admin_user_id, now() - interval '27 days',
    true, 'https://cal.com/hassan-abdalla/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '32 days', now() - interval '27 days',
    now() - interval '42 days', now() - interval '3 days'
  );
  advisor_count := advisor_count + 1;

  -- Amira Fathy - E-commerce Specialist (Cairo)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'amira.fathy@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '38 days',
    '{"full_name": "Amira Fathy", "avatar_url": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150"}'::jsonb,
    now() - interval '38 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Amira Fathy',
    'E-commerce developer specializing in Shopify, WooCommerce, and custom e-commerce solutions. Expert in payment integration and inventory management systems.',
    'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150',
    ARRAY['Shopify', 'WooCommerce', 'PHP', 'JavaScript', 'Stripe', 'PayPal'],
    ARRAY['ecommerce', 'payments', 'fullstack'],
    ARRAY['Arabic', 'English'],
    4.8, 25,
    'approved', 'EG', admin_user_id, now() - interval '23 days',
    true, 'https://cal.com/amira-fathy/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '28 days', now() - interval '23 days',
    now() - interval '38 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  RAISE NOTICE '✅ Created % Egyptian advisors', 8;

  -- =====================================================
  -- Saudi Arabian Advisors (6)
  -- =====================================================

  -- Abdullah Al-Rashid - Senior Java Developer (Riyadh)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'abdullah.alrashid@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '52 days',
    '{"full_name": "Abdullah Al-Rashid", "avatar_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150"}'::jsonb,
    now() - interval '52 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Abdullah Al-Rashid',
    'Senior Java developer with 10+ years experience in enterprise applications. Specialized in Spring Boot, microservices, and banking solutions. Based in Riyadh.',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
    ARRAY['Java', 'Spring Boot', 'MySQL', 'Maven', 'JUnit', 'Kafka'],
    ARRAY['backend', 'enterprise', 'fintech'],
    ARRAY['Arabic', 'English'],
    4.9, 34,
    'approved', 'SA', admin_user_id, now() - interval '37 days',
    true, 'https://cal.com/abdullah-alrashid/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '42 days', now() - interval '37 days',
    now() - interval '52 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Sarah Al-Zahra - React Native Expert (Jeddah)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'sarah.alzahra@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '48 days',
    '{"full_name": "Sarah Al-Zahra", "avatar_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150"}'::jsonb,
    now() - interval '48 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Sarah Al-Zahra',
    'React Native developer with expertise in cross-platform mobile development. Created 20+ mobile apps with focus on user experience and performance optimization.',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    ARRAY['React Native', 'TypeScript', 'Redux', 'Firebase', 'iOS', 'Android'],
    ARRAY['mobile', 'frontend', 'ui/ux'],
    ARRAY['Arabic', 'English'],
    4.8, 29,
    'approved', 'SA', admin_user_id, now() - interval '33 days',
    true, 'https://cal.com/sarah-alzahra/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '38 days', now() - interval '33 days',
    now() - interval '48 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  -- Khalid Al-Mutairi - Cloud Architect (Riyadh)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'khalid.almutairi@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '44 days',
    '{"full_name": "Khalid Al-Mutairi", "avatar_url": "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=150"}'::jsonb,
    now() - interval '44 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Khalid Al-Mutairi',
    'Cloud solutions architect with AWS and Azure certifications. Specialized in designing scalable cloud infrastructure for government and enterprise clients.',
    'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=150',
    ARRAY['AWS', 'Azure', 'Terraform', 'CloudFormation', 'Kubernetes', 'Security'],
    ARRAY['cloud', 'devops', 'security'],
    ARRAY['Arabic', 'English'],
    4.9, 22,
    'approved', 'SA', admin_user_id, now() - interval '29 days',
    true, 'https://cal.com/khalid-almutairi/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '34 days', now() - interval '29 days',
    now() - interval '44 days', now() - interval '3 days'
  );
  advisor_count := advisor_count + 1;

  -- Layla Al-Faisal - Frontend Vue.js Specialist (Mecca)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'layla.alfaisal@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '41 days',
    '{"full_name": "Layla Al-Faisal", "avatar_url": "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150"}'::jsonb,
    now() - interval '41 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Layla Al-Faisal',
    'Frontend developer specializing in Vue.js and modern JavaScript frameworks. Expert in component-based architecture and state management with Vuex and Pinia.',
    'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150',
    ARRAY['Vue.js', 'Nuxt.js', 'JavaScript', 'Vuex', 'Pinia', 'CSS3'],
    ARRAY['frontend', 'vue'],
    ARRAY['Arabic', 'English'],
    4.7, 19,
    'approved', 'SA', admin_user_id, now() - interval '26 days',
    true, 'https://cal.com/layla-alfaisal/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '31 days', now() - interval '26 days',
    now() - interval '41 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Faisal Al-Harbi - Cybersecurity Expert (Jeddah)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'faisal.alharbi@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '46 days',
    '{"full_name": "Faisal Al-Harbi", "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150"}'::jsonb,
    now() - interval '46 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Faisal Al-Harbi',
    'Cybersecurity specialist with CISSP and CEH certifications. Expert in penetration testing, security audits, and compliance frameworks for enterprise applications.',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    ARRAY['Security Auditing', 'Penetration Testing', 'OWASP', 'Linux', 'Python', 'Compliance'],
    ARRAY['security', 'auditing', 'compliance'],
    ARRAY['Arabic', 'English'],
    4.9, 26,
    'approved', 'SA', admin_user_id, now() - interval '31 days',
    true, 'https://cal.com/faisal-alharbi/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '36 days', now() - interval '31 days',
    now() - interval '46 days', now() - interval '4 days'
  );
  advisor_count := advisor_count + 1;

  -- Nadia Al-Qasimi - Full-Stack .NET Developer (Medina)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'nadia.alqasimi@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '39 days',
    '{"full_name": "Nadia Al-Qasimi", "avatar_url": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150"}'::jsonb,
    now() - interval '39 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Nadia Al-Qasimi',
    'Full-stack .NET developer with expertise in C#, ASP.NET Core, and SQL Server. Experience in building enterprise applications and web APIs for healthcare and finance sectors.',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    ARRAY['C#', 'ASP.NET Core', 'SQL Server', 'Entity Framework', 'Azure', 'Angular'],
    ARRAY['fullstack', 'dotnet', 'enterprise'],
    ARRAY['Arabic', 'English'],
    4.8, 24,
    'approved', 'SA', admin_user_id, now() - interval '24 days',
    true, 'https://cal.com/nadia-alqasimi/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '29 days', now() - interval '24 days',
    now() - interval '39 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  RAISE NOTICE '✅ Created % Saudi advisors', 6;

  -- =====================================================
  -- Indian Advisors (6)
  -- =====================================================

  -- Raj Sharma - MEAN Stack Developer (Mumbai)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'raj.sharma@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '57 days',
    '{"full_name": "Raj Sharma", "avatar_url": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}'::jsonb,
    now() - interval '57 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Raj Sharma',
    'Full-stack developer specialized in MEAN stack (MongoDB, Express, Angular, Node.js). 8 years experience building scalable web applications for e-commerce and fintech companies.',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    ARRAY['Node.js', 'Angular', 'MongoDB', 'Express.js', 'TypeScript', 'Docker'],
    ARRAY['fullstack', 'angular', 'ecommerce'],
    ARRAY['English', 'Hindi'],
    4.8, 32,
    'approved', 'IN', admin_user_id, now() - interval '42 days',
    true, 'https://cal.com/raj-sharma/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '47 days', now() - interval '42 days',
    now() - interval '57 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Priya Patel - React & GraphQL Expert (Bangalore)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'priya.patel@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '51 days',
    '{"full_name": "Priya Patel", "avatar_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150"}'::jsonb,
    now() - interval '51 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Priya Patel',
    'Frontend developer with expertise in React ecosystem and GraphQL. Specialized in performance optimization and modern web development practices. Based in Bangalore tech hub.',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    ARRAY['React', 'GraphQL', 'Apollo Client', 'Next.js', 'Webpack', 'Jest'],
    ARRAY['frontend', 'react', 'graphql'],
    ARRAY['English', 'Hindi', 'Gujarati'],
    4.9, 28,
    'approved', 'IN', admin_user_id, now() - interval '36 days',
    true, 'https://cal.com/priya-patel/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '41 days', now() - interval '36 days',
    now() - interval '51 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  -- Arjun Reddy - Machine Learning Engineer (Hyderabad)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'arjun.reddy@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '47 days',
    '{"full_name": "Arjun Reddy", "avatar_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150"}'::jsonb,
    now() - interval '47 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Arjun Reddy',
    'Machine learning engineer with PhD in Computer Science. Specialized in deep learning, computer vision, and natural language processing. Experience with TensorFlow and PyTorch.',
    'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
    ARRAY['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'OpenCV', 'Kubernetes'],
    ARRAY['ai/ml', 'data', 'research'],
    ARRAY['English', 'Hindi', 'Telugu'],
    4.9, 21,
    'approved', 'IN', admin_user_id, now() - interval '32 days',
    true, 'https://cal.com/arjun-reddy/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '37 days', now() - interval '32 days',
    now() - interval '47 days', now() - interval '3 days'
  );
  advisor_count := advisor_count + 1;

  -- Sneha Gupta - iOS Developer (Delhi)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'sneha.gupta@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '43 days',
    '{"full_name": "Sneha Gupta", "avatar_url": "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150"}'::jsonb,
    now() - interval '43 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Sneha Gupta',
    'iOS developer with 6 years experience in Swift and Objective-C. Expert in iOS SDK, Core Data, and publishing apps to App Store. Created 12+ apps for startups and enterprises.',
    'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150',
    ARRAY['Swift', 'Objective-C', 'iOS SDK', 'Core Data', 'Xcode', 'App Store'],
    ARRAY['mobile', 'ios'],
    ARRAY['English', 'Hindi'],
    4.8, 25,
    'approved', 'IN', admin_user_id, now() - interval '28 days',
    true, 'https://cal.com/sneha-gupta/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '33 days', now() - interval '28 days',
    now() - interval '43 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Vikram Singh - DevOps & Kubernetes Expert (Mumbai)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'vikram.singh@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '49 days',
    '{"full_name": "Vikram Singh", "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"}'::jsonb,
    now() - interval '49 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Vikram Singh',
    'DevOps engineer specialized in Kubernetes orchestration and CI/CD pipelines. Expert in containerization, monitoring, and infrastructure as code using Terraform.',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    ARRAY['Kubernetes', 'Docker', 'Jenkins', 'Terraform', 'Prometheus', 'Grafana'],
    ARRAY['devops', 'kubernetes', 'monitoring'],
    ARRAY['English', 'Hindi', 'Punjabi'],
    4.9, 30,
    'approved', 'IN', admin_user_id, now() - interval '34 days',
    true, 'https://cal.com/vikram-singh/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '39 days', now() - interval '34 days',
    now() - interval '49 days', now() - interval '4 days'
  );
  advisor_count := advisor_count + 1;

  -- Kavya Nair - UX Researcher & Product Designer (Bangalore)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'kavya.nair@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '36 days',
    '{"full_name": "Kavya Nair", "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150"}'::jsonb,
    now() - interval '36 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Kavya Nair',
    'UX researcher and product designer with background in psychology and human-computer interaction. Specialized in user research, prototyping, and design systems.',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    ARRAY['Figma', 'Adobe XD', 'User Research', 'Prototyping', 'Design Systems', 'Usability Testing'],
    ARRAY['ui/ux', 'research', 'product'],
    ARRAY['English', 'Hindi', 'Malayalam'],
    4.8, 23,
    'approved', 'IN', admin_user_id, now() - interval '21 days',
    true, 'https://cal.com/kavya-nair/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '26 days', now() - interval '21 days',
    now() - interval '36 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  RAISE NOTICE '✅ Created % Indian advisors', 6;

  -- =====================================================
  -- Other Countries Advisors (4)
  -- =====================================================

  -- Ahmad Al-Maktoum - Blockchain Developer (Dubai, UAE)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'ahmad.almaktoum@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '54 days',
    '{"full_name": "Ahmad Al-Maktoum", "avatar_url": "https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=150"}'::jsonb,
    now() - interval '54 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Ahmad Al-Maktoum',
    'Blockchain developer and smart contract specialist. Expert in Solidity, Web3, and DeFi protocols. Experience building cryptocurrency exchanges and NFT marketplaces in Dubai.',
    'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?w=150',
    ARRAY['Solidity', 'Web3', 'Ethereum', 'Smart Contracts', 'DeFi', 'React'],
    ARRAY['blockchain', 'web3', 'fintech'],
    ARRAY['Arabic', 'English'],
    4.9, 19,
    'approved', 'AE', admin_user_id, now() - interval '39 days',
    true, 'https://cal.com/ahmad-almaktoum/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '44 days', now() - interval '39 days',
    now() - interval '54 days', now() - interval '3 days'
  );
  advisor_count := advisor_count + 1;

  -- Lina Khoury - Full-Stack Ruby Developer (Amman, Jordan)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'lina.khoury@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '45 days',
    '{"full_name": "Lina Khoury", "avatar_url": "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150"}'::jsonb,
    now() - interval '45 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Lina Khoury',
    'Full-stack Ruby on Rails developer with 7 years experience. Expert in building web applications with clean, maintainable code. Strong background in TDD and agile methodologies.',
    'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150',
    ARRAY['Ruby', 'Rails', 'PostgreSQL', 'RSpec', 'JavaScript', 'Heroku'],
    ARRAY['fullstack', 'ruby', 'tdd'],
    ARRAY['Arabic', 'English'],
    4.8, 26,
    'approved', 'JO', admin_user_id, now() - interval '30 days',
    true, 'https://cal.com/lina-khoury/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '35 days', now() - interval '30 days',
    now() - interval '45 days', now() - interval '2 days'
  );
  advisor_count := advisor_count + 1;

  -- Youssef Bennani - PHP & Laravel Expert (Casablanca, Morocco)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'youssef.bennani@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '41 days',
    '{"full_name": "Youssef Bennani", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150"}'::jsonb,
    now() - interval '41 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Youssef Bennani',
    'PHP developer specialized in Laravel framework and modern PHP practices. Expert in building RESTful APIs, e-commerce platforms, and content management systems.',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    ARRAY['PHP', 'Laravel', 'MySQL', 'Vue.js', 'Composer', 'PHPUnit'],
    ARRAY['backend', 'php', 'ecommerce'],
    ARRAY['Arabic', 'French', 'English'],
    4.7, 22,
    'approved', 'MA', admin_user_id, now() - interval '26 days',
    true, 'https://cal.com/youssef-bennani/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '31 days', now() - interval '26 days',
    now() - interval '41 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  -- Fatima Shah - Android Developer (Karachi, Pakistan)
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at
  ) VALUES (
    gen_random_uuid(),
    'fatima.shah@example.com',
    crypt('password123', gen_salt('bf')),
    now() - interval '37 days',
    '{"full_name": "Fatima Shah", "avatar_url": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150"}'::jsonb,
    now() - interval '37 days'
  ) RETURNING id INTO current_advisor_id;
  
  INSERT INTO advisors (
    user_id, display_name, bio, avatar_url,
    skills, specialties, languages, rating, review_count,
    approval_status, country_code, approved_by, approved_at,
    is_accepting_bookings, cal_com_event_type_url,
    onboarding_steps, review_started_at, review_completed_at,
    created_at, updated_at
  ) VALUES (
    current_advisor_id,
    'Fatima Shah',
    'Android developer with expertise in Kotlin and Java. Specialized in performance optimization and material design. Built 18+ apps for healthcare and education sectors.',
    'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150',
    ARRAY['Kotlin', 'Java', 'Android SDK', 'Material Design', 'Firebase', 'Room'],
    ARRAY['mobile', 'android'],
    ARRAY['English', 'Urdu'],
    4.8, 20,
    'approved', 'PK', admin_user_id, now() - interval '22 days',
    true, 'https://cal.com/fatima-shah/consultation',
    '{"profile_completed": true, "skills_added": true, "availability_set": true, "stripe_connected": true, "cal_connected": true, "admin_approved": true}'::jsonb,
    now() - interval '27 days', now() - interval '22 days',
    now() - interval '37 days', now() - interval '1 day'
  );
  advisor_count := advisor_count + 1;

  RAISE NOTICE '✅ Created % other country advisors', 4;

  -- Update sequence to ensure proper counts
  RAISE NOTICE '🎯 Migration 047 completed successfully: Created % diverse mock advisors for testing', advisor_count;
  RAISE NOTICE '🌍 Geographic breakdown: 8 Egyptian + 6 Saudi + 6 Indian + 4 Other = % total', advisor_count;
  RAISE NOTICE '✅ All advisors approved with completed onboarding steps';
  RAISE NOTICE '🔗 Ready for frontend testing at http://localhost:3000/en/advisor/';
  
END $$;