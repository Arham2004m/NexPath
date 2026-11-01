# NexPath evaluation: fixed plan vs adaptive plan

50 simulated students (goals x weekly hours x work patterns), each run twice. Lower is better in every column. Forecast error is how many days off the finish date shown to the student was, averaged over every week until they finished; weeks behind is how far behind the plan they were.

| Student pattern | Runs | Forecast error, fixed (days) | Forecast error, adaptive (days) | Weeks behind, fixed | Weeks behind, adaptive | Peak behind, fixed | Peak behind, adaptive | Replans |
|---|---|---|---|---|---|---|---|---|
| fast | 10 | 51.1 | 51.1 | 0 | 0 | 0 | 0 | 0 |
| steady | 10 | 9.2 | 9.2 | 0 | 0 | 0.2 | 0.2 | 0 |
| slow | 10 | 138 | 77 | 5.1 | 1.2 | 10.1 | 2.5 | 7.9 |
| inconsistent | 10 | 24.5 | 17.2 | 1.5 | 0.7 | 3.4 | 2.1 | 1.4 |
| vanishes | 10 | 18.8 | 9 | 2.6 | 0.5 | 3.9 | 2.5 | 1.4 |
| ALL | 50 | 48.3 | 32.7 | 1.8 | 0.5 | 3.5 | 1.5 | 2.1 |
