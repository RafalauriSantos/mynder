import {createSyncPayload, SyncContractError, validateSyncIdentity, validateSyncRevision, type SyncIdentity, type SyncMap} from '../../src/sync/contracts.ts';
import type {Document} from '../../src/document.ts';
import {SyncRepository} from './repository.ts';

/** Domain boundary shared by Pages and the authenticated MCP transport. */
export class SyncMapService{
  private readonly repository:SyncRepository;
  constructor(db:D1Database){this.repository=new SyncRepository(db)}

  list(identityValue:SyncIdentity):Promise<SyncMap[]>{
    return this.repository.list(validateSyncIdentity(identityValue));
  }

  get(identityValue:SyncIdentity,mapId:string):Promise<SyncMap|null>{
    const identity=validateSyncIdentity(identityValue);
    validateSyncRevision({mapId,revision:1});
    return this.repository.get(identity,mapId);
  }

  create(identityValue:SyncIdentity,documentValue:unknown):Promise<SyncMap>{
    const identity=validateSyncIdentity(identityValue);
    const document=createSyncPayload(documentValue).document;
    return this.repository.create(identity,document);
  }

  update(identityValue:SyncIdentity,mapId:string,expectedRevision:number,documentValue:unknown):Promise<SyncMap>{
    const identity=validateSyncIdentity(identityValue);
    validateSyncRevision({mapId,revision:expectedRevision});
    const document=createSyncPayload(documentValue).document;
    if(document.id!==mapId)throw new SyncContractError('invalid');
    return this.repository.update(identity,mapId,expectedRevision,document as Document);
  }

  delete(identityValue:SyncIdentity,mapId:string,expectedRevision:number):Promise<SyncMap>{
    const identity=validateSyncIdentity(identityValue);
    validateSyncRevision({mapId,revision:expectedRevision});
    return this.repository.tombstone(identity,mapId,expectedRevision);
  }

  restore(identityValue:SyncIdentity,mapId:string,expectedRevision:number):Promise<SyncMap>{
    const identity=validateSyncIdentity(identityValue);
    validateSyncRevision({mapId,revision:expectedRevision});
    return this.repository.restore(identity,mapId,expectedRevision);
  }
}
