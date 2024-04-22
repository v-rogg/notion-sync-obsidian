import {App, PluginSettingTab, Setting} from 'obsidian';
import LinearSyncPlugin from './../main';

export class LinearSyncSettingTab extends PluginSettingTab {
	plugin: LinearSyncPlugin;

	constructor(app: App, plugin: LinearSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("API Key for connecting with the Linear API. Use a 'Personal API Key'")
			.addText((text) =>
				text
					.setPlaceholder("lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxx")
					.setValue(typeof this.plugin.settings.apiKey === 'string' ? this.plugin.settings.apiKey : "")
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
