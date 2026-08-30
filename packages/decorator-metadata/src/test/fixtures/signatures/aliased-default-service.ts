// getPublicMethodSignatures テスト用: export { Local as default } 形式の default export
class AliasedDefaultService {
  ping(): boolean {
    return true;
  }
}

export { AliasedDefaultService as default };
