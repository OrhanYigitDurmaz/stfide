import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { BoardToolsService, BoardToolsServicePath } from '../common/board-tools-protocol';
import { BoardToolsServiceImpl } from './board-tools-backend-service';

export default new ContainerModule(bind => {
    bind(BoardToolsServiceImpl).toSelf().inSingletonScope();
    bind(BoardToolsService).toService(BoardToolsServiceImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(BoardToolsServicePath, () => ctx.container.get(BoardToolsService))
    ).inSingletonScope();
});
