import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import NotionSyncPlugin from "./../main";
import { searchForDatabases } from "./notion";

export interface NotionSyncSettings {
	apiToken: string | null;
	todoDatabaseId: string | null;
	databases: any[];
}

export const DEFAULT_SETTINGS: Partial<NotionSyncSettings> = {
	apiToken: null,
};

export class NotionSyncSettingsTab extends PluginSettingTab {
	plugin: NotionSyncPlugin;

	constructor(app: App, plugin: NotionSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		let databaseIdEl: Setting;
		let databases: any = [];

		containerEl.empty();

		new Setting(containerEl).setHeading().setName("General API settings");

		new Setting(containerEl)
			.setName("API Token")
			.setDesc("API Token for connecting with the Notion API.")
			.addText((text) =>
				text
					.setPlaceholder("secret_xxxxxxxxxxxxxxxxxxxxxxxxxx")
					.setValue(
						typeof this.plugin.settings.apiToken === "string"
							? this.plugin.settings.apiToken
							: "",
					)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value;
						new Notice("API Token stored");
						databases = (await searchForDatabases(value)).results;
						this.plugin.settings.databases = databases;
						if (databases.length > 0) {
							databaseIdEl
								.clear()
								.setName("To-Do Database Page")
								.addDropdown((drop) => {
									for (let db of databases) {
										drop.addOption(
											db.id,
											db.title[0].plain_text,
										);
									}

									if (this.plugin.settings.todoDatabaseId) {
										drop.setValue(
											this.plugin.settings.todoDatabaseId,
										);
									} else {
										this.plugin.settings.todoDatabaseId = databases[0].id;
									}
									drop.onChange(async (value) => {
										this.plugin.settings.todoDatabaseId =
											value;
										await this.plugin.saveSettings();
									});
								});
						} else {
							databaseIdEl.setDisabled(true);
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setHeading().setName("To-Do settings");

		if (this.plugin.settings.databases.length <= 0) {
			databaseIdEl = new Setting(containerEl)
				.setName("To-Do Database Page")
				.setDisabled(true);
		} else if (this.plugin.settings.databases.length > 0) {
			databaseIdEl = new Setting(containerEl)
				.setName("To-Do Database Page")
				.addDropdown((drop) => {
					for (let db of this.plugin.settings.databases) {
						drop.addOption(db.id, db.title[0].plain_text);
					}

					if (this.plugin.settings.todoDatabaseId) {
						drop.setValue(this.plugin.settings.todoDatabaseId);
					}
					drop.onChange(async (value) => {
						this.plugin.settings.todoDatabaseId = value;
						await this.plugin.saveSettings();
					});
				});
		}
	}
}
