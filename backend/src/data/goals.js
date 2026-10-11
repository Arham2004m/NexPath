// Goal catalog: single source of truth for the 7 career goals.
// Each goal is a distinct outcome. The docs' separate "Startup / Full Stack" goal was removed:
// it duplicated Web Developer (full stack) and Entrepreneur. Full stack lives under web_dev.
// Durations are sanity-check ranges (weeks) for a beginner at ~REFERENCE_HOURS_PER_WEEK;
// the roadmap generator computes real length from the student's hours.
// Node lists per goal arrive with the knowledge graph module.
export const REFERENCE_HOURS_PER_WEEK = 10;

export const GOALS = [
  { id: 'faang', label: 'Product Company Placement', description: 'Get hired at product companies (FAANG-style and well-funded startups) by mastering DSA, problem solving and system design for interviews.', focus: ['DSA', 'System design', 'Competitive programming'], weeks: [20, 24] },
  { id: 'campus_placement', label: 'Campus Placements (Service & Mass Recruiters)', description: 'Clear aptitude rounds, online tests and interviews at companies like TCS, Infosys, Wipro and Cognizant with solid basics and communication.', focus: ['Aptitude & reasoning', 'Programming basics', 'DSA fundamentals', 'SQL, OS, CN basics', 'Resume & HR'], weeks: [8, 12] },
  { id: 'gate', label: 'GATE / M.Tech Preparation', description: 'Core CS theory and aptitude for a high GATE score, opening M.Tech and PSU options.', focus: ['OS', 'DBMS', 'CN', 'TOC', 'Algorithms', 'Maths'], weeks: [24, 32] },
  { id: 'ms_abroad', label: 'MS Abroad (GRE + Research)', description: 'Build the fundamentals, research profile and GRE readiness for a Master’s abroad.', focus: ['GRE prep', 'Research skills', 'CS fundamentals'], weeks: [24, 32] },
  { id: 'entrepreneur', label: 'Entrepreneur / Build Your Own Product', description: 'Go from idea to a launched MVP: build it yourself with a practical full-stack toolkit, then validate, ship and learn the business basics.', focus: ['Idea validation', 'MVP build', 'Launch & growth', 'Business basics'], weeks: [16, 20] },
  { id: 'ai_ml', label: 'AI / ML Engineer', description: 'Python and maths foundations through ML, deep learning, NLP and MLOps.', focus: ['Python', 'ML', 'Deep learning', 'NLP', 'MLOps'], weeks: [16, 20] },
  {
    id: 'web_dev', label: 'Web Developer', description: 'Become a job-ready web developer. Pick frontend, backend or full stack as your specialisation.', focus: ['HTML/CSS/JS', 'React', 'Node + Express', 'Databases'], weeks: [10, 24],
    subTracks: [
      { id: 'frontend', label: 'Frontend', description: 'HTML/CSS, JavaScript, React, state management, TypeScript, accessibility.', weeks: [10, 12] },
      { id: 'backend', label: 'Backend', description: 'Node + Express, REST design, databases, auth, deployment, API security.', weeks: [10, 12] },
      { id: 'fullstack', label: 'Full Stack', description: 'Both sides of the web, system design basics and two portfolio projects; the broadest and longest web path.', weeks: [20, 24] }
    ]
  },
  {
    id: 'mobile_dev', label: 'Mobile App Developer', description: 'Become a job-ready mobile developer. Pick Android, iOS or cross-platform Flutter.', focus: ['Kotlin / Swift / Dart', 'UI frameworks', 'APIs', 'Firebase'], weeks: [12, 18],
    subTracks: [
      { id: 'android', label: 'Android (Kotlin)', description: 'Kotlin, Jetpack Compose, ViewModel, Room, Retrofit, Firebase, Play Store.', weeks: [14, 16] },
      { id: 'flutter', label: 'Cross-platform (Flutter / Dart)', description: 'Dart, widgets, state management, REST, Firebase, Android and iOS release.', weeks: [12, 14], recommended: true },
      { id: 'ios', label: 'iOS (Swift)', description: 'Swift, SwiftUI, navigation, state, persistence, networking, Firebase, App Store.', weeks: [14, 18] }
    ]
  }
];

export const GOAL_BY_ID = Object.fromEntries(GOALS.map((goal) => [goal.id, goal]));

export const HOURS_PER_WEEK = { min: 3, max: 40 };
export const MAX_TARGET_WEEKS = 104;

// Minimum plausible weeks for a goal/sub-track at the student's weekly hours, or null if unknown.
export function minimumWeeks(goalId, subTrack, hoursPerWeek) {
  const goal = GOAL_BY_ID[goalId];
  if (!goal) return null;
  const [min] = goal.subTracks?.find((s) => s.id === subTrack)?.weeks || goal.weeks;
  return Math.ceil((min * REFERENCE_HOURS_PER_WEEK) / hoursPerWeek);
}
