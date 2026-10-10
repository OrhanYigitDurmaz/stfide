import { injectable } from '@theia/core/shared/inversify';
import { MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution } from '@theia/core/lib/browser';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { BoardConfiguratorWidget } from './board-tools-widget';

export const BoardConfiguratorCommand: Command = {
    id: 'board-tools:toggle',
    label: 'Board Configurator'
};

@injectable()
export class BoardConfiguratorContribution extends AbstractViewContribution<BoardConfiguratorWidget> {

    constructor() {
        super({
            widgetId: BoardConfiguratorWidget.ID,
            widgetName: BoardConfiguratorWidget.LABEL,
            defaultWidgetOptions: { area: 'right' },
            toggleCommandId: BoardConfiguratorCommand.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(BoardConfiguratorCommand, {
            execute: () => super.openView({ activate: true, reveal: true })
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
    }
}
