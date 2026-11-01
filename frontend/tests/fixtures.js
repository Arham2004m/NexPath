// A small but realistic saved roadmap and progress, shaped exactly like the API's answers.
const resource = (id) => ({ id, type: 'article', title: `Resource ${id}`, url: `https://example.com/${id}`, provider: 'Example', free: true, pricing: 'Free', time: '1 h', why: 'Useful' });

export const makePlan = (overrides = {}) => ({
  goalId: 'web_dev', subTrack: 'frontend', hoursPerWeek: 10, targetWeeks: null, startDate: '2026-01-05', endDate: '2026-01-18',
  totalHours: 12, totalWeeks: 2, baselineHours: 20, hoursSaved: 8, completedHours: 0, feasible: true, achievable: true, requiredHoursPerWeek: null,
  masteredNodeIds: ['n0'], completedTopics: [],
  nodes: [
    { id: 'n0', name: 'Programming Basics', domain: 'prog', level: 1, estimatedHours: 10, fullHours: 10, status: 'mastered', source: 'assessment', prerequisites: [], topics: [{ id: 'n0-1', title: 'Variables', hours: 10 }], miniTasks: ['x'], resources: [], skippedHours: 0, creditedTopics: 0, order: -1 },
    { id: 'n1', name: 'HTML and CSS', domain: 'web', level: 1, estimatedHours: 7, fullHours: 7, status: 'next', source: null, prerequisites: ['n0'], skippedHours: 0, creditedTopics: 0, order: 0, startWeek: 1, endWeek: 1, capstone: false,
      topics: [{ id: 't1', title: 'Semantic HTML', hours: 4, startWeek: 1, endWeek: 1 }, { id: 't2', title: 'Flexbox and grid', hours: 3, startWeek: 1, endWeek: 1 }], miniTasks: ['Build a page', 'Recreate a layout'], resources: [resource('r1'), resource('r2')] },
    { id: 'n2', name: 'JavaScript', domain: 'web', level: 1, estimatedHours: 5, fullHours: 5, status: 'upcoming', source: null, prerequisites: ['n1'], skippedHours: 0, creditedTopics: 0, order: 1, startWeek: 2, endWeek: 2, capstone: true,
      topics: [{ id: 't3', title: 'ES6 fundamentals', hours: 5, startWeek: 2, endWeek: 2 }], miniTasks: ['Solve 10 exercises'], resources: [resource('r3')] }
  ],
  edges: [{ from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }],
  weeks: [
    { index: 1, startDate: '2026-01-05', endDate: '2026-01-11', plannedHours: 7, miniTask: { nodeId: 'n1', text: 'Recreate a layout' }, resources: [resource('r1')],
      topics: [{ topicId: 't1', nodeId: 'n1', nodeName: 'HTML and CSS', title: 'Semantic HTML', hours: 4, continued: false }, { topicId: 't2', nodeId: 'n1', nodeName: 'HTML and CSS', title: 'Flexbox and grid', hours: 3, continued: false }] },
    { index: 2, startDate: '2026-01-12', endDate: '2026-01-18', plannedHours: 5, miniTask: { nodeId: 'n2', text: 'Solve 10 exercises' }, resources: [resource('r3')],
      topics: [{ topicId: 't3', nodeId: 'n2', nodeName: 'JavaScript', title: 'ES6 fundamentals', hours: 5, continued: false }] }
  ],
  ...overrides
});

export const makeProgress = (overrides = {}) => ({
  percentComplete: 0, doneHours: 0, totalHours: 12, carriedHours: 0, topicsDone: 0, topicsTotal: 3,
  currentWeek: 1, weeksEnded: 0, totalWeeks: 2, plannedHoursToDate: 7, loggedHours: 0, velocity: null, lagWeeks: null, pace: 'not_started',
  topicStatus: { t1: 'current', t2: 'current', t3: 'upcoming' }, minutesByTopic: {},
  nodes: { n1: { done: 0, total: 2, complete: false }, n2: { done: 0, total: 1, complete: false } },
  weekly: [
    { index: 1, startDate: '2026-01-05', endDate: '2026-01-11', state: 'current', plannedHours: 7, completedHours: 0, completionRate: 0, minutesLogged: 0 },
    { index: 2, startDate: '2026-01-12', endDate: '2026-01-18', state: 'upcoming', plannedHours: 5, completedHours: 0, completionRate: 0, minutesLogged: 0 }
  ],
  nextUp: [
    { topicId: 't1', nodeId: 'n1', nodeName: 'HTML and CSS', title: 'Semantic HTML', hours: 4, week: 1, overdue: false },
    { topicId: 't2', nodeId: 'n1', nodeName: 'HTML and CSS', title: 'Flexbox and grid', hours: 3, week: 1, overdue: false },
    { topicId: 't3', nodeId: 'n2', nodeName: 'JavaScript', title: 'ES6 fundamentals', hours: 5, week: 2, overdue: false }
  ],
  ...overrides
});

// Progress after t1 (4 of 12 hours) is done, as the server would report it.
export const progressAfterT1 = () => makeProgress({
  percentComplete: 33, doneHours: 4, topicsDone: 1, topicStatus: { t1: 'done', t2: 'current', t3: 'upcoming' },
  nodes: { n1: { done: 1, total: 2, complete: false }, n2: { done: 0, total: 1, complete: false } },
  nextUp: [{ topicId: 't2', nodeId: 'n1', nodeName: 'HTML and CSS', title: 'Flexbox and grid', hours: 3, week: 1, overdue: false }, { topicId: 't3', nodeId: 'n2', nodeName: 'JavaScript', title: 'ES6 fundamentals', hours: 5, week: 2, overdue: false }]
});

export const catalog = {
  limits: { hoursPerWeek: { min: 3, max: 40 }, maxTargetWeeks: 104 },
  goals: [
    { id: 'faang', label: 'Product Company Placement', description: 'Interview prep.', focus: ['DSA'], estimatedHours: 229, roadmapReady: true, weeksByHours: { 3: 77, 10: 24, 20: 13, 40: 7 } },
    { id: 'gate', label: 'GATE / M.Tech Preparation', description: 'Core CS.', focus: ['OS'], estimatedHours: 330, roadmapReady: true, weeksByHours: { 3: 110, 10: 34, 20: 18, 40: 9 } },
    {
      id: 'web_dev', label: 'Web Developer', description: 'Frontend, backend or full stack.', focus: ['React'], estimatedHours: [100, 250], roadmapReady: true,
      subTracks: [
        { id: 'frontend', label: 'Frontend', description: 'HTML, CSS, JS.', estimatedHours: 100, roadmapReady: true, weeksByHours: { 3: 34, 10: 11, 20: 6, 40: 3 } },
        { id: 'fullstack', label: 'Full Stack', description: 'Everything.', estimatedHours: 250, roadmapReady: true, weeksByHours: { 3: 84, 10: 26, 20: 14, 40: 7 } }
      ]
    }
  ]
};
