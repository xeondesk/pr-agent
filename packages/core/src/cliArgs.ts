export class CliArgs {
  static validateUserArgs(args: string[]): [boolean, string] {
    try {
      if (!args || args.length === 0) {
        return [true, ''];
      }

      const encodedArgs =
        'c2hhcmVkX3NlY3JldA==:dXNlcg==:c3lzdGVt:ZW5hYmxlX2NvbW1lbnRfYXBwcm92YWw=:ZW5hYmxlX21hbnVhbF9hcHByb3ZhbA==:ZW5hYmxlX2F1dG9fYXBwcm92YWw=:YXBwcm92ZV9wcl9vbl9zZWxmX3Jldmlldw==:YmFzZV91cmw=:dXJs:YXBwX25hbWU=:c2VjcmV0X3Byb3ZpZGVy:Z2l0X3Byb3ZpZGVy:c2tpcF9rZXlz:b3BlbmFpLmtleQ==:QU5BTFlUSUNTX0ZPTERFUg==:dXJp:YXBwX2lk:d2ViaG9va19zZWNyZXQ=:YmVhcmVyX3Rva2Vu:UEVSU09OQUxfQUNDRVNTX1RPS0VO:b3ZlcnJpZGVfZGVwbG95bWVudF90eXBl:cHJpdmF0ZV9rZXk=:bG9jYWxfY2FjaGVfcGF0aA==:ZW5hYmxlX2xvY2FsX2NhY2hl:amlyYV9iYXNlX3VybA==:YXBpX2Jhc2U=:YXBpX3R5cGU=:YXBpX3ZlcnNpb24=:c2tpcF9rZXlz';

      const forbiddenCliArgs: string[] = [];
      for (const e of encodedArgs.split(':')) {
        forbiddenCliArgs.push(Buffer.from(e, 'base64').toString('utf-8'));
      }

      for (let i = 0; i < forbiddenCliArgs.length; i++) {
        forbiddenCliArgs[i] = forbiddenCliArgs[i].toLowerCase();
        if (!forbiddenCliArgs[i].includes('.')) {
          forbiddenCliArgs[i] = '.' + forbiddenCliArgs[i];
        }
      }

      for (const arg of args) {
        if (arg.startsWith('--')) {
          let argWord = arg.toLowerCase();
          argWord = argWord.replace('__', '.');
          for (const forbiddenWord of forbiddenCliArgs) {
            if (argWord.includes(forbiddenWord)) {
              return [false, forbiddenWord];
            }
          }
        }
      }
      return [true, ''];
    } catch (e: unknown) {
      return [false, String(e)];
    }
  }
}
