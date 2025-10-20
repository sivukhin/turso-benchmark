import struct
import numpy as np

np.random.seed(0)

n_samples = 500_000
n_features = 20_000
nnz = 200

print('CREATE TABLE vectors (id TEXT, embedding FLOAT32(20000));')
for i in range(n_samples):
    idx = np.random.choice(n_features, nnz, replace=False)
    values = np.random.rand(nnz)
    blob = bytearray()
    blob += struct.pack(f"<{nnz}f", *values)
    blob += struct.pack(f"<{nnz}I", *idx)
    blob += struct.pack("<I", n_features)
    blob += struct.pack("<B", 9)
    print(f"INSERT INTO vectors VALUES ('{i}', x'{blob.hex().upper()}');")


