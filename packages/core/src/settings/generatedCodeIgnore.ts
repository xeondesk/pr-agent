export const generatedCodeIgnore = {
  generated_code: {
    protobuf: [
      "**/*.pb.go",
      "**/*.pb.cc",
      "**/*_pb2.py",
      "**/*.pb.swift",
      "**/*.pb.rb",
      "**/*.pb.php",
      "**/*.pb.h",
    ],
    openapi: [
      "**/__generated__/**",
      "**/openapi_client/**",
      "**/openapi_server/**",
    ],
    swagger: [
      "**/swagger.json",
      "**/swagger.yaml",
    ],
    graphql: [
      "**/*.graphql.ts",
      "**/*.generated.ts",
      "**/*.graphql.js",
    ],
    grpc_python: ["**/*_grpc.py"],
    grpc_java: ["**/*Grpc.java"],
    grpc_csharp: ["**/*Grpc.cs"],
    grpc_typescript: ["**/*_grpc.ts", "**/*_grpc.js"],
    go_gen: [
      "**/*_gen.go",
      "**/*generated.go",
    ],
  },
};
