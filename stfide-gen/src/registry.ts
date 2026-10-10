import { Emitter } from './emitters/emitter';
import { arduinoEmitter } from './emitters/arduino';
import { picoEmitter } from './emitters/pico';
import { espidfEmitter } from './emitters/espidf';

export const allEmitters: readonly Emitter[] = [
    arduinoEmitter,
    picoEmitter,
    espidfEmitter
];

export function emitterById(id: string): Emitter | undefined {
    return allEmitters.find(emitter => emitter.id === id);
}
