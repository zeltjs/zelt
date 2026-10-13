import { enableAsyncContext as enableBuiltAsyncContext } from '../packages/core/dist/async-context/index.js';
import { enableAsyncContext as enableSourceAsyncContext } from '../packages/core/src/async-context';

// Existing contracts exercise the Node behavior; portable suites explicitly
// select contextMode: 'sync' on each runtime, even while ALS is available.
enableSourceAsyncContext();
enableBuiltAsyncContext();
