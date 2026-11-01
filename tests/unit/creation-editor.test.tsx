// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreationColumn } from '../../src/host/CreationColumn';
import { DEFAULT_PET } from '../../shared/creations';

const api = vi.hoisted(() => ({ analyzeCreation: vi.fn(), buildCreation: vi.fn() }));
vi.mock('../../src/lib/creationApi', () => api);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  URL.createObjectURL = vi.fn(() => 'blob:sketch');
  URL.revokeObjectURL = vi.fn();
  api.buildCreation.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = { mode: 'pet' as const, onMode: vi.fn(), connected: true, reducedMotion: true, onBuilt: vi.fn(), visionReady: true };

describe('creation editor async boundaries', () => {
  it('hydrates a confirmed pet and keeps local edits through same-version socket ticks', () => {
    const creation = { mode: 'pet' as const, pet: { ...DEFAULT_PET, name: 'Nova', bodyShape: 'tall' as const }, circuit: null, source: 'manual' as const, version: 7 };
    const view = render(<CreationColumn {...props} creation={creation} />);
    expect((screen.getByTestId('pet-name') as HTMLInputElement).value).toBe('Nova');
    fireEvent.change(screen.getByTestId('pet-name'), { target: { value: 'Draft' } });
    view.rerender(<CreationColumn {...props} creation={structuredClone(creation)} />);
    expect((screen.getByTestId('pet-name') as HTMLInputElement).value).toBe('Draft');
    view.rerender(<CreationColumn {...props} creation={{ ...creation, version: 8, pet: { ...creation.pet, name: 'Imported' } }} />);
    expect((screen.getByTestId('pet-name') as HTMLInputElement).value).toBe('Imported');
  });

  it('serializes recognition and prevents a late result overwriting manual edits', async () => {
    let resolve!: (v: unknown) => void;
    api.analyzeCreation.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<CreationColumn {...props} />);
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [new File(['png'], 'sketch.png', { type: 'image/png' })] } });
    expect((screen.getByTestId('upload-input') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('build-world') as HTMLButtonElement).disabled).toBe(true);
    // Simulate an edit that arrives from another UI input while the request is pending.
    fireEvent.change(screen.getByTestId('pet-name'), { target: { value: 'My new draft' } });
    resolve({ model: 'test-model', creation: { mode: 'pet', inScope: true, pet: { ...DEFAULT_PET, name: 'Late result' }, uncertainties: [] } });
    await waitFor(() => expect((screen.getByTestId('pet-name') as HTMLInputElement).value).toBe('My new draft'));
    expect(api.analyzeCreation).toHaveBeenCalledTimes(1);
  });

  it('only marks a confirmed build and removes that stamp when the draft changes', async () => {
    render(<CreationColumn {...props} />);
    expect(screen.queryByText('Confirmed')).toBeNull();
    fireEvent.click(screen.getByTestId('build-world'));
    await screen.findByText('Confirmed');
    fireEvent.change(screen.getByTestId('pet-name'), { target: { value: 'Changed' } });
    expect(screen.queryByText('Confirmed')).toBeNull();
  });
});
