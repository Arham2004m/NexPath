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

// What the server sends about replanning: the newest unread explanation and any offer to lower the hours.
export const shiftEvent = (overrides = {}) => ({
  id: 'e1', action: 'shift', reason: 'behind schedule', fromVersion: 1, toVersion: 2, createdAt: '2026-01-26T10:00:00.000Z', seenAt: null, suggestion: null,
  message: 'You were 2.4 weeks behind schedule, so your 3 unfinished topics (12 h) were rescheduled starting today. Your finish date moved from 18 Jan 2026 to 8 Feb 2026. Nothing you finished was changed.',
  metrics: { velocity: 0.2, lagWeeks: 2.4, weeksEnded: 3, plannedHours: 30, completedHours: 6, pace: 'behind' }, details: {}, ...overrides
});
export const enrichEvent = (overrides = {}) => shiftEvent({ id: 'e2', action: 'enrich', reason: 'ahead of schedule', message: 'You were 1.5 weeks ahead of schedule, so 2 optional topics (9 h) were added as extras. They are optional: they do not change your finish date, your pace or your percentage.', metrics: { velocity: 1.6, lagWeeks: -1.6, weeksEnded: 2, plannedHours: 20, completedHours: 32, pace: 'ahead' }, ...overrides });
export const hoursOffer = (overrides = {}) => ({ hoursPerWeek: 5, currentHoursPerWeek: 10, averageCompletedHours: 3.5, weeks: 3, ...overrides });

// A plan that already has optional extras (one skill, two topics) and the matching progress numbers.
export const extrasBlock = () => ({
  addedAt: '2026-01-12',
  topics: [
    { topicId: 'x1', nodeId: 'xn', nodeName: 'Extra skill', title: 'Extra topic one', hours: 5, index: 0 },
    { topicId: 'x2', nodeId: 'xn', nodeName: 'Extra skill', title: 'Extra topic two', hours: 4, index: 1 }
  ],
  nodes: [{ id: 'xn', name: 'Extra skill', domain: 'web', level: 2, status: 'optional', optional: true, source: null, capstone: false, prerequisites: ['n1'], estimatedHours: 9, fullHours: 12, skippedHours: 0, creditedTopics: 0, order: 1000, startWeek: null, endWeek: null,
    topics: [{ id: 'x1', title: 'Extra topic one', hours: 5 }, { id: 'x2', title: 'Extra topic two', hours: 4 }], miniTasks: ['Try it', 'Try it again'], resources: [] }],
  edges: [{ from: 'n1', to: 'xn' }]
});
export const extrasProgress = (done = 0) => ({
  topicStatus: { t1: 'current', t2: 'current', t3: 'upcoming', x1: done >= 1 ? 'done' : 'optional', x2: done >= 2 ? 'done' : 'optional' },
  nodes: { n1: { done: 0, total: 2, complete: false }, n2: { done: 0, total: 1, complete: false }, xn: { done, total: 2, complete: done === 2 } },
  extras: {
    total: 2, done, hours: 9, doneHours: done === 0 ? 0 : done === 1 ? 5 : 9, nodes: { xn: { done, total: 2, complete: done === 2 } },
    topics: [{ topicId: 'x1', nodeId: 'xn', nodeName: 'Extra skill', title: 'Extra topic one', hours: 5, index: 0, done: done >= 1, minutes: 0 }, { topicId: 'x2', nodeId: 'xn', nodeName: 'Extra skill', title: 'Extra topic two', hours: 4, index: 1, done: done >= 2, minutes: 0 }]
  }
});
