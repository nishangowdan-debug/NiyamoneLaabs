/** Minimal type stub for `qrcode-svg`. The package ships no declarations
 *  and several services in this app use the default-export constructor
 *  pattern: `new QRCode({...}).svg()`. This d.ts unblocks strict-mode
 *  TypeScript without bringing in a heavyweight community types package. */
declare module 'qrcode-svg' {
  interface QRCodeOptions {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: 'L' | 'M' | 'Q' | 'H';
    join?: boolean;
    container?: 'svg' | 'svg-viewbox' | 'g' | 'none';
    pretty?: boolean;
    swap?: boolean;
    xmlDeclaration?: boolean;
  }
  class QRCode {
    constructor(opts: QRCodeOptions | string);
    svg(): string;
  }
  export default QRCode;
}
