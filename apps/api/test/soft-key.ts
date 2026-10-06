import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest();
const b64url = (data: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(data));
const cbor = (value: unknown) => isoCBOR.encode(value as Parameters<typeof isoCBOR.encode>[0]);

const UP = 0x01; // user present
const UV = 0x04; // user verified
const AT = 0x40; // attested credential data follows

/** A software security key (ES256, "none" attestation): enough to drive the API's real WebAuthn checks in tests. */
export class SoftKey {
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private readonly rawId = randomBytes(16);
  private counter = 0;

  constructor(
    private readonly rpId = process.env.ADMIN_RP_ID!,
    private readonly origin = process.env.ADMIN_ORIGIN!,
  ) {}

  get id() {
    return b64url(this.rawId);
  }

  private authData(flags: number, counter: number, attested = Buffer.alloc(0)) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    return Buffer.concat([sha256(this.rpId), Buffer.from([flags]), count, attested]);
  }

  private clientData(type: string, challenge: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  /** navigator.credentials.create() */
  register({ challenge }: { challenge: string }) {
    const { x, y } = this.keys.publicKey.export({ format: 'jwk' });
    const cose = cbor(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, isoBase64URL.toBuffer(x!)], [-3, isoBase64URL.toBuffer(y!)]]));
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.rawId.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLength, this.rawId, cose]);
    const attestationObject = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(this.authData(UP | UV | AT, 0, attested))]]));
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(this.clientData('webauthn.create', challenge)), attestationObject: b64url(attestationObject), transports: ['usb'] },
    };
  }

  /** navigator.credentials.get() */
  assert({ challenge }: { challenge: string }) {
    const authenticatorData = this.authData(UP | UV, ++this.counter);
    const clientDataJSON = this.clientData('webauthn.get', challenge);
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.keys.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authenticatorData), signature: b64url(signature) },
    };
  }
}
