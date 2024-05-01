import {App, Notice, PluginSettingTab, Setting} from 'obsidian';
import NotionSyncPlugin from './../main';

export interface NotionSyncSettings {
	apiKey: string | null;
	todoDatabaseId: string | null;
}

export const DEFAULT_SETTINGS: Partial<NotionSyncSettings> = {
	apiKey: null
}

export class NotionSyncSettingsTab extends PluginSettingTab {
	plugin: NotionSyncPlugin;

	constructor(app: App, plugin: NotionSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setHeading()
			.setName("General API settings")

		new Setting(containerEl)
			.setName("API Token")
			.setDesc("API Token for connecting with the Notion API.")
			.addText((text) =>
				text
					.setPlaceholder("secret_xxxxxxxxxxxxxxxxxxxxxxxxxx")
					.setValue(typeof this.plugin.settings.apiKey === 'string' ? this.plugin.settings.apiKey : "")
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
						new Notice("API Token stored");
					})
			);

		new Setting(containerEl)
			.setHeading()
			.setName("ToDo settings")

		new Setting(containerEl)
			.setName("ToDo Database ID")
			.addText((text) =>
				text
					.setValue(typeof this.plugin.settings.todoDatabaseId === 'string' ? this.plugin.settings.todoDatabaseId : "")
					.onChange(async (value) => {
						this.plugin.settings.todoDatabaseId = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
