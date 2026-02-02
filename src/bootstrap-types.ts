
export interface WorkerData {
    __mt_kind: string
    id: string
    userData: any
}

export interface InlineWorkerData extends WorkerData {
    __mt_kind: 'inlineFn' | 'asyncValue'
    /** The function source code as a string. */
    entry: string
}

export interface WorkerFileData extends WorkerData {
    __mt_kind: 'workerFile'
}

export interface AsyncValueWorkerFileData extends WorkerData {
    __mt_kind: 'asyncValueFile'
    exportName?: string
}
