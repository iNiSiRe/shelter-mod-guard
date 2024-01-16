import { Connector } from "netbus";
import * as TelegramBot from "node-telegram-bot-api";
import { Registry, RemoteDevice } from "shelter-core/registry";

export class Guard
{
    public enabled: boolean = false;

    constructor(
        private readonly chatId: number,
        private readonly telegram: TelegramBot,
        motion: RemoteDevice,
        door: RemoteDevice
    ) {
        telegram.on('message', this.onTelegramMessage.bind(this));
        telegram.on('callback_query', this.onTelegramCallbackQuery.bind(this));

        motion.onUpdate(this.onMotionUpdate.bind(this));
        door.onUpdate(this.onDoorUpdate.bind(this));
    }

    private onDoorUpdate(update: Map<string, any>)
    {
        console.log(`Door updated: ${JSON.stringify(Object.fromEntries(update.entries()))}`);

        if (!this.enabled) {
            return;
        }

        if (!update.has('magnet')) {
            return;
        }

        const magnet = update.get('magnet');

        if (magnet.open === true) {
            this.telegram.sendMessage(this.chatId, 'Magnet sensor "door-1" is opened');
        } else {
            this.telegram.sendMessage(this.chatId, 'Magnet sensor "door-1" is closed');
        }
    }

    private onMotionUpdate(update: Map<string, any>)
    {
        if (!this.enabled) {
            return;
        }

        if (!update.has('motionAt')) {
            return;
        }

        this.telegram.sendMessage(this.chatId, 'Motion detected on sensor "motion-1"');
    }

    private formatMemoryUsage = (data: number) => `${Math.round((data / 1024 / 1024) * 100) / 100} MB`;

    private buildStatus = () => {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {text: 'Status', callback_data: 'status'},
                        {text: 'Enable', callback_data: 'enable'},
                        {text: 'Disable', callback_data: 'disable'},
                    ]
                ]
            }
        };

        const text = 'Guard: ' + (this.enabled ? 'enabled' : 'disabled');

        return {opts: opts, text: text};
    };

    private onTelegramMessage(msg: TelegramBot.Message)
    {
        const chatId = msg.chat.id;

        switch (msg.text) {
            case '/memory': {
                const mem = process.memoryUsage();
                const response = `RSS: ${ this.formatMemoryUsage(mem.rss)} \n`
                    + `HEAP (total): ${this.formatMemoryUsage(mem.heapTotal)} \n`
                    + `HEAP (used): ${this.formatMemoryUsage(mem.heapUsed)} \n`
                    + `EXTERNAL: ${this.formatMemoryUsage(mem.external)}`;

                this.telegram.sendMessage(chatId, response);

                break;
            }

            case '/start': {
                const status = this.buildStatus();
                this.telegram.sendMessage(chatId, status.text, status.opts);
                break;
            }

            default: {
                this.telegram.sendMessage(chatId, 'Unknown command');
            }
        }
    }

    private onTelegramCallbackQuery(callbackQuery: TelegramBot.CallbackQuery)
    {
        const action = callbackQuery.data!;
        const msg = callbackQuery.message!;
        const chatId = msg.chat.id!;

        switch (action) {
            case 'enable': {
                this.enabled = true;
                const status = this.buildStatus();
                this.telegram.answerCallbackQuery(callbackQuery.id, {text: status.text});
                break;
            }

            case 'disable': {
                this.enabled = false;
                const status = this.buildStatus();
                this.telegram.answerCallbackQuery(callbackQuery.id, {text: status.text});
                break;
            }

            case 'status': {
                const status = this.buildStatus();
                this.telegram.answerCallbackQuery(callbackQuery.id, {text: status.text});
                break;
            }

            default: {
                console.log('Unknown action: ' + action);
                this.telegram.sendMessage(chatId, 'Unknown command');
            }
        }
    }
}



(async () => {
    const bus = await Connector.connect(process.env.BUS_ID, process.env.BUS);
    const registry = new Registry(bus);

    await registry.start();

    const motion = registry.find(process.env.LUMI_MOTION_ID);
    const door = registry.find(process.env.LUMI_DOOR_ID);

    if (!motion || !door) {
        console.error('No devices');
        return;
    }

    const guard = new Guard(
        Number.parseInt(process.env.TELEGRAM_CHAT_ID),
        new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true}),
        motion,
        door
    );
}) ();