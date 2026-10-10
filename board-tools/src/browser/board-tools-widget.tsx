import * as React from 'react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { OpenerService, open } from '@theia/core/lib/browser';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { URI } from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    BoardDetails,
    BoardSummary,
    BoardToolsService
} from '../common/board-tools-protocol';

type Board = BoardDetails['board'];

/** Collect the pin labels a peripheral definition refers to, across all known kinds. */
function peripheralReferences(peripheral: NonNullable<Board['peripherals']>[number]): string[] {
    const record = peripheral as unknown as Record<string, unknown>;
    const references: string[] = [];
    for (const key of ['tx', 'rx', 'sda', 'scl', 'sck', 'mosi', 'miso', 'pin']) {
        const value = record[key];
        if (typeof value === 'string' && value.length > 0 && !references.includes(value)) {
            references.push(value);
        }
    }
    return references;
}

@injectable()
export class BoardConfiguratorWidget extends ReactWidget {

    static readonly ID = 'board-tools:configurator';
    static readonly LABEL = 'Board Configurator';

    @inject(BoardToolsService)
    protected readonly boardTools!: BoardToolsService;

    @inject(WorkspaceService)
    protected readonly workspaceService!: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService!: OpenerService;

    protected boards: BoardSummary[] = [];
    protected selectedPath: string | undefined;
    protected details: BoardDetails | undefined;
    protected busy = false;
    protected statusLines: string[] = [];

    @postConstruct()
    protected init(): void {
        this.id = BoardConfiguratorWidget.ID;
        this.title.label = BoardConfiguratorWidget.LABEL;
        this.title.caption = BoardConfiguratorWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'fa fa-microchip';
        void this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.update();
        await this.refresh();
    }

    protected workspaceRoot(): string | undefined {
        const roots = this.workspaceService.tryGetRoots();
        return roots.length > 0 ? roots[0].resource.path.fsPath() : undefined;
    }

    protected async refresh(): Promise<void> {
        const root = this.workspaceRoot();
        if (!root) {
            this.pushStatus('No workspace root found. Open a folder to list boards.');
            this.update();
            return;
        }
        await this.runBusy(async () => {
            this.boards = await this.boardTools.listBoards(root);
            this.pushStatus(this.boards.length > 0
                ? `Found ${this.boards.length} board file(s) under ${root}/boards.`
                : `No board files found under ${root}/boards.`);
        });
    }

    protected async select(summary: BoardSummary): Promise<void> {
        this.selectedPath = summary.path;
        this.details = undefined;
        await this.runBusy(async () => {
            this.details = await this.boardTools.readBoard(summary.path);
        });
    }

    protected async validate(): Promise<void> {
        const boardPath = this.selectedPath;
        if (!boardPath) {
            this.pushStatus('Select a board first.');
            this.update();
            return;
        }
        await this.runBusy(async () => {
            const details = await this.boardTools.readBoard(boardPath);
            this.details = details;
            const errors = details.issues.filter(issue => issue.level === 'error');
            const warnings = details.issues.filter(issue => issue.level === 'warning');
            for (const issue of errors) {
                this.pushStatus(`error: ${issue.message}`);
            }
            for (const issue of warnings) {
                this.pushStatus(`warning: ${issue.message}`);
            }
            this.pushStatus(errors.length === 0
                ? `OK: no validation errors (${warnings.length} warning(s))`
                : `validation failed (${errors.length} error(s), ${warnings.length} warning(s))`);
        });
    }

    protected async generate(target: string): Promise<void> {
        const boardPath = this.selectedPath;
        if (!boardPath) {
            this.pushStatus('Select a board first.');
            this.update();
            return;
        }
        await this.runBusy(async () => {
            const outcome = await this.boardTools.generate(boardPath, [target]);
            for (const result of outcome.results) {
                const first = result.files[0];
                const dir = first ? first.substring(0, first.lastIndexOf('/')) : '';
                this.pushStatus(`generated ${result.files.length} file(s) for target "${result.target}" in ${dir}`);
                if (result.merged.length > 0) {
                    this.pushStatus(`merged USER CODE in ${result.merged.length} file(s) for target "${result.target}"`);
                }
            }
            if (outcome.error) {
                this.pushStatus(`error: ${outcome.error}`);
            }
        });
    }

    protected async openJson(): Promise<void> {
        const boardPath = this.selectedPath;
        if (!boardPath) {
            this.pushStatus('Select a board first.');
            this.update();
            return;
        }
        try {
            await open(this.openerService, new URI(boardPath));
        } catch (error) {
            this.pushStatus(`error: cannot open ${boardPath}: ${(error as Error).message}`);
            this.update();
        }
    }

    protected async runBusy(action: () => Promise<void>): Promise<void> {
        this.busy = true;
        this.update();
        try {
            await action();
        } catch (error) {
            this.pushStatus(`error: ${(error as Error).message ?? String(error)}`);
        } finally {
            this.busy = false;
            this.update();
        }
    }

    protected pushStatus(line: string): void {
        this.statusLines = [line, ...this.statusLines].slice(0, 100);
    }

    protected render(): React.ReactElement {
        return <div id='board-tools-widget' className='board-tools-widget'>
            <div className='board-tools-header'>
                <span className='board-tools-title'>Boards</span>
                <button
                    className='theia-button secondary'
                    disabled={this.busy}
                    onClick={() => void this.refresh()}>
                    Refresh
                </button>
            </div>
            {this.renderBoardList()}
            {this.renderDetails()}
            {this.renderActions()}
            {this.renderStatus()}
        </div>;
    }

    protected renderBoardList(): React.ReactNode {
        if (this.boards.length === 0) {
            return <div className='board-tools-empty'>No boards loaded.</div>;
        }
        return <ul className='board-tools-board-list'>
            {this.boards.map(board => <li
                key={board.path}
                className={'board-tools-board-item' + (board.path === this.selectedPath ? ' selected' : '')}
                title={board.path}
                onClick={() => void this.select(board)}>
                <span className='board-tools-board-name'>{board.name}</span>
                <span className='board-tools-board-meta'>{board.mcu} · {board.pinCount} pins</span>
            </li>)}
        </ul>;
    }

    protected renderDetails(): React.ReactNode {
        if (!this.details) {
            return <div className='board-tools-details'>Select a board to see its pins and peripherals.</div>;
        }
        const board: Board = (this.details.board ?? {}) as Board;
        const pins = Array.isArray(board.pins) ? board.pins : [];
        const peripherals = Array.isArray(board.peripherals) ? board.peripherals : [];
        const leds = Array.isArray(board.leds) ? board.leds : [];
        return <div className='board-tools-details'>
            <h3 className='board-tools-board-title'>{board.displayName ?? board.name ?? 'Board'}</h3>
            <div className='board-tools-summary'>
                <span>{board.name}</span>
                <span>mcu: {board.mcu ?? 'unknown'}</span>
                <span>clock: {board.clock?.sysHz !== undefined ? `${board.clock.sysHz} Hz` : 'unspecified'}</span>
                <span>flash: {board.flash?.method ?? 'unspecified'}{board.flash?.sizeKB !== undefined ? ` (${board.flash.sizeKB} KiB)` : ''}</span>
            </div>
            <h4>Pins</h4>
            <table className='board-tools-pins'>
                <thead>
                    <tr><th>Pin</th><th>Label</th><th>Signal</th><th>Pull</th><th>Initial</th></tr>
                </thead>
                <tbody>
                    {pins.map(pin => <tr key={pin.pin}>
                        <td>{pin.pin}</td>
                        <td>{pin.label}</td>
                        <td>{pin.signal}</td>
                        <td>{pin.pull ?? ''}</td>
                        <td>{pin.initial ?? ''}</td>
                    </tr>)}
                </tbody>
            </table>
            {peripherals.length > 0 && <React.Fragment>
                <h4>Peripherals</h4>
                <ul className='board-tools-peripherals'>
                    {peripherals.map((peripheral, index) => {
                        const references = peripheralReferences(peripheral);
                        return <li key={`${peripheral.kind}-${peripheral.id}-${index}`}>
                            <span className='board-tools-peripheral'>{peripheral.kind} {peripheral.id}</span>
                            {references.length > 0 ? ` → ${references.join(', ')}` : ''}
                        </li>;
                    })}
                </ul>
            </React.Fragment>}
            {leds.length > 0 && <React.Fragment>
                <h4>LEDs</h4>
                <ul className='board-tools-leds'>
                    {leds.map(led => <li key={led.name}>
                        {led.name} → {led.label}{led.activeLow ? ' (active low)' : ''}
                    </li>)}
                </ul>
            </React.Fragment>}
        </div>;
    }

    protected renderActions(): React.ReactNode {
        const board = this.details?.board;
        const isRp2040 = board?.mcu === 'rp2040';
        const isEsp32s3 = board?.mcu === 'esp32s3';
        const disabled = this.busy || !this.selectedPath;
        return <div className='board-tools-actions'>
            <button className='theia-button secondary' disabled={disabled} onClick={() => void this.validate()}>
                Validate
            </button>
            <button className='theia-button secondary' disabled={disabled} onClick={() => void this.generate('arduino')}>
                Generate Arduino
            </button>
            <button className='theia-button secondary' disabled={disabled || !isRp2040} onClick={() => void this.generate('pico')}>
                Generate Pico
            </button>
            <button className='theia-button secondary' disabled={disabled || !isEsp32s3} onClick={() => void this.generate('espidf')}>
                Generate ESP-IDF
            </button>
            <button className='theia-button secondary' disabled={disabled} onClick={() => void this.openJson()}>
                Open JSON
            </button>
        </div>;
    }

    protected renderStatus(): React.ReactNode {
        return <div className='board-tools-status'>
            {this.statusLines.map((line, index) => <div key={`${index}-${line}`} className='board-tools-status-line'>
                {line}
            </div>)}
        </div>;
    }
}
