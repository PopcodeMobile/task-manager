// Historical DI-only compatibility fixture; final runtime uses normalized/local-panel repositories.
import { clone, publicError, WorkspaceError } from '../../src/workspace/errors.js';

export function createWorkspaceController({ repository, delay = 150, onStatus = () => {} }) {
  const epoch = crypto.randomUUID();
  let current = null;
  let generation = 0;
  let pending = null;
  let timer;
  let flight;
  let transition = Promise.resolve();
  let status = { status: 'idle', error: null };
  const update = (state, error = null) => {
    status = { status: state, error: error?.code || null };
    onStatus(status);
  };
  const scope = () => ({ workspaceId: current?.id || null, generation, epoch });
  const isCurrent = captured => captured?.epoch === epoch && captured?.workspaceId === current?.id && captured?.generation === generation;
  async function flush() {
    clearTimeout(timer);
    if (flight) await flight;
    if (!pending) return;
    flight = (async () => {
      while (pending) {
        const job = pending;
        const record = current;
        const operationGeneration = generation;
        pending = null;
        update('saving');
        try {
          const revision = await repository.save(job.id, job.data, record.revision);
          if (current === record && generation === operationGeneration) {
            current.revision = revision;
            update(pending ? 'saving' : 'saved');
          }
        } catch (error) {
          const safe = publicError(error);
          if (current !== record || generation !== operationGeneration) return;
          pending ||= job;
          update('error', safe);
          throw safe;
        }
      }
    })();
    try {
      await flight;
    } finally {
      flight = null;
    }
  }
  return {
    get current() {
      return current;
    },
    get status() {
      return status;
    },
    get dirty() {
      return !!pending || !!flight;
    },
    scope,
    isCurrent,
    save(data, captured = scope()) {
      if (!current || !isCurrent(captured)) throw new WorkspaceError('stale_scope');
      if (current.membership?.role === 'guest') throw new WorkspaceError('forbidden');
      pending = { id: current.id, data: clone(data) };
      current.data = data;
      clearTimeout(timer);
      if (status.error !== 'conflict') {
        update('pending');
        if (repository.mode === 'local') flush().catch(() => {});
        else
          timer = setTimeout(() => {
            flush().catch(() => {});
          }, delay);
      }
    },
    flush,
    switch(id) {
      const operation = transition.then(async () => {
        const requestedGeneration = generation;
        await flush();
        if (current?.id === id) return current;
        const next = await repository.load(id);
        // The UI can still edit the old workspace while its successor loads.
        await flush();
        if (generation !== requestedGeneration) throw new WorkspaceError('stale_scope');
        current = next;
        generation++;
        update('idle');
        return next;
      });
      transition = operation.catch(() => {});
      return operation;
    },
    async reload() {
      const requested = scope();
      if (flight) await flight.catch(() => {});
      if (!current || !isCurrent(requested)) throw new WorkspaceError('stale_scope');
      const next = await repository.load(current.id);
      if (!isCurrent(requested)) throw new WorkspaceError('stale_scope');
      clearTimeout(timer);
      pending = null;
      current = next;
      generation++;
      update('idle');
      return next;
    },
    clear() {
      clearTimeout(timer);
      pending = null;
      current = null;
      generation++;
      update('idle');
    },
  };
}
