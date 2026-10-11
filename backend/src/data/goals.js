// Goal catalog: single source of truth for the 7 career goals.
// Each goal is a distinct outcome. The docs' separate "Startup / Full Stack" goal was removed:
// it duplicated Web Developer (full stack) and Entrepreneur. Full stack lives under web_dev.
// Durations are not stored here: they are computed from the knowledge graph (see services/goalEstimates.js),
// so the numbers shown to students always match the roadmap they will actually get.

export const GOALS = [
  { id: 'faang', label: 'Product Company Placement', description: 'Get hired at product companies (FAANG-style and well-funded startups) by mastering DSA, problem solving and system design for interviews.', focus: ['DSA', 'System design', 'Competitive programming'] },
  { id: 'campus_placement', label: 'Campus Placements (Service & Mass Recruiters)', description: 'Clear aptitude rounds, online tests and interviews at companies like TCS, Infosys, Wipro and Cognizant with solid basics and communication.', focus: ['Aptitude & reasoning', 'Programming basics', 'DSA fundamentals', 'SQL, OS, CN basics', 'Resume & HR'] },
  { id: 'gate', label: 'GATE / M.Tech Preparation', description: 'Core CS theory and aptitude for a high GATE score, opening M.Tech and PSU options.', focus: ['OS', 'DBMS', 'CN', 'TOC', 'Algorithms', 'Maths'] },
  { id: 'ms_abroad', label: 'MS Abroad (GRE + Research)', description: 'Build the fundamentals, research profile and GRE readiness for a Master’s abroad.', focus: ['GRE prep', 'Research skills', 'CS fundamentals'] },
  { id: 'entrepreneur', label: 'Entrepreneur / Build Your Own Product', description: 'Go from idea to a launched MVP: build it yourself with a practical full-stack toolkit, then validate, ship and learn the business basics.', focus: ['Idea validation', 'MVP build', 'Launch & growth', 'Business basics'] },
  { id: 'ai_ml', label: 'AI / ML Engineer', description: 'Python and maths foundations through ML, deep learning, NLP and MLOps.', focus: ['Python', 'ML', 'Deep learning', 'NLP', 'MLOps'] },
  {
    id: 'web_dev', label: 'Web Developer', description: 'Become a job-ready web developer. Pick frontend, backend or full stack as your specialisation.', focus: ['HTML/CSS/JS', 'React', 'Node + Express', 'Databases'],
    subTracks: [
      { id: 'frontend', label: 'Frontend', description: 'HTML/CSS, JavaScript, React, state management, TypeScript, accessibility.' },
      { id: 'backend', label: 'Backend', description: 'Node + Express, REST design, databases, auth, deployment, API security.' },
      { id: 'fullstack', label: 'Full Stack', description: 'Both sides of the web, system design basics and two portfolio projects; the broadest and longest web path.' }
    ]
  },
  {
    id: 'mobile_dev', label: 'Mobile App Developer', description: 'Become a job-ready mobile developer. Pick Android, iOS or cross-platform Flutter.', focus: ['Kotlin / Swift / Dart', 'UI frameworks', 'APIs', 'Firebase'],
    subTracks: [
      { id: 'android', label: 'Android (Kotlin)', description: 'Kotlin, Jetpack Compose, ViewModel, Room, Retrofit, Firebase, Play Store.' },
      { id: 'flutter', label: 'Cross-platform (Flutter / Dart)', description: 'Dart, widgets, state management, REST, Firebase, Android and iOS release.', recommended: true },
      { id: 'ios', label: 'iOS (Swift)', description: 'Swift, SwiftUI, navigation, state, persistence, networking, Firebase, App Store.' }
    ]
  }
];

export const GOAL_BY_ID = Object.fromEntries(GOALS.map((goal) => [goal.id, goal]));

export const HOURS_PER_WEEK = { min: 3, max: 40 };
export const MAX_TARGET_WEEKS = 104;
