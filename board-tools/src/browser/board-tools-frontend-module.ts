import { ContainerModule } from '@theia/core/shared/inversify';
import {
    bindViewContribution,
    FrontendApplicationContribution,
    WebSocketConnectionProvider,
    WidgetFactory
} from '@theia/core/lib/browser';
import { BoardConfiguratorWidget } from './board-tools-widget';
import { BoardConfiguratorContribution } from './board-tools-contribution';
import { BoardToolsService, BoardToolsServicePath } from '../common/board-tools-protocol';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindViewContribution(bind, BoardConfiguratorContribution);
    bind(FrontendApplicationContribution).toService(BoardConfiguratorContribution);
    bind(BoardConfiguratorWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: BoardConfiguratorWidget.ID,
        createWidget: () => ctx.container.get<BoardConfiguratorWidget>(BoardConfiguratorWidget)
    })).inSingletonScope();
    bind(BoardToolsService).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<BoardToolsService>(BoardToolsServicePath);
    }).inSingletonScope();
});
