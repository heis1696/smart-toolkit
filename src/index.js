// @ts-nocheck
import { Core } from './core.js';
import { UI } from './ui.js';
import { StatusBarModule } from './modules/statusbar.js';

const modules = [StatusBarModule];

jQuery(async function () {
    const ctx = SillyTavern.getContext();

    modules.forEach(m => m.init?.());
    UI.render(modules);

    // 初始化世界书
    await Core.ensureWorldBook(modules);

    const throttledMessage = _.throttle(async (msgId) => {
        for (const m of modules) await m.onMessage?.(msgId);
    }, 3000);

    ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, throttledMessage);
    ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, (data) => {
        for (const m of modules) m.onChatReady?.(data);
    });

    console.log('[SmartToolkit] loaded');
});
