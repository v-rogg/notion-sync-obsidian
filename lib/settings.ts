import {App, PluginSettingTab, Setting} from 'obsidian';
import LinearSyncPlugin from './../main';
import {LinearClient, WorkflowState} from '@linear/sdk';

export interface LinearSyncSettings {
	apiKey: string | null;
	workflowStates: WorkflowState[];
	todoWorkflowState: string;
	inProgressWorkflowState: string;
	doneWorkflowState: string;
	canceledWorkflowState: string;
}

export const DEFAULT_SETTINGS: Partial<LinearSyncSettings> = {
	apiKey: null
}

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
			.setHeading()
			.setName("General API settings")

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("API Key for connecting with the Linear API. Use a 'Personal API Key'")
			.addText((text) =>
				text
					.setPlaceholder("lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxx")
					.setValue(typeof this.plugin.settings.apiKey === 'string' ? this.plugin.settings.apiKey : "")
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						const linearClient= new LinearClient({apiKey: this.plugin.settings.apiKey})
						this.plugin.settings.workflowStates = <WorkflowState[]>(await linearClient.workflowStates()).nodes
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setHeading()
			.setName("Linear Workspace settings")

		new Setting(containerEl)
			.setName("'Todo' workflow state")
			.addDropdown(drop => {
				for (let workflow of this.plugin.settings.workflowStates) {
					drop.setValue(this.plugin.settings.todoWorkflowState)
					drop.addOption(workflow.id, workflow.name)
				}
				drop.onChange(async (value) => {
					this.plugin.settings.todoWorkflowState = value
					await this.plugin.saveSettings();
				});
			})
			.setDisabled(this.plugin.settings.workflowStates === undefined)

		new Setting(containerEl)
			.setName("'In Progress' workflow state")
			.addDropdown(drop => {
				for (let workflow of this.plugin.settings.workflowStates) {
					drop.setValue(this.plugin.settings.inProgressWorkflowState)
					drop.addOption(workflow.id, workflow.name)
				}
				drop.onChange(async (value) => {
					this.plugin.settings.inProgressWorkflowState = value
					await this.plugin.saveSettings();
				});
			})
			.setDisabled(this.plugin.settings.workflowStates === undefined)

		new Setting(containerEl)
			.setName("'Done' workflow state")
			.addDropdown(drop => {
				for (let workflow of this.plugin.settings.workflowStates) {
					drop.setValue(this.plugin.settings.doneWorkflowState)
					drop.addOption(workflow.id, workflow.name)
				}
				drop.onChange(async (value) => {
					this.plugin.settings.doneWorkflowState = value
					await this.plugin.saveSettings();
				});
			})
			.setDisabled(this.plugin.settings.workflowStates === undefined)

		new Setting(containerEl)
			.setName("'Canceled' workflow state")
			.addDropdown(drop => {
				for (let workflow of this.plugin.settings.workflowStates) {
					drop.setValue(this.plugin.settings.canceledWorkflowState)
					drop.addOption(workflow.id, workflow.name)
				}
				drop.onChange(async (value) => {
					this.plugin.settings.canceledWorkflowState = value
					console.log(value)
					await this.plugin.saveSettings();
				});
			})
			.setDisabled(this.plugin.settings.workflowStates === undefined)
	}
}
