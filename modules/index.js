/**
 * Central module entry point.
 * Import new modules here and register them with registry.register(myModule).
 */

import { registry } from './module-registry.js';
import { quickNotesModule } from './quick-notes/index.js';
import { pageActionsModule } from './page-actions/index.js';
import { colorInspectorModule } from './color-inspector/index.js';
import { userSnippetsModule } from './user-snippets/index.js';

// Register core interaction modules
registry.register(quickNotesModule);
registry.register(pageActionsModule);
registry.register(colorInspectorModule);
registry.register(userSnippetsModule);

export { registry };
