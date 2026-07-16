/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/surety_core.json`.
 */
export type SuretyCore = {
  "address": "3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW",
  "metadata": {
    "name": "suretyCore",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SURETY fully collateralized prize indemnity and prop settlement vault"
  },
  "instructions": [
    {
      "name": "executeWithdrawal",
      "discriminator": [
        113,
        121,
        203,
        232,
        137,
        139,
        248,
        249
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "withdrawal"
          ]
        },
        {
          "name": "assetMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "reserve",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "withdrawal",
          "writable": true
        },
        {
          "name": "requestShareAccount",
          "writable": true
        },
        {
          "name": "lpAssetAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "expirePolicy",
      "discriminator": [
        149,
        24,
        43,
        100,
        240,
        50,
        39,
        124
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "bucket",
            "policy"
          ]
        },
        {
          "name": "assetMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "reserve",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "bucket",
          "writable": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true
        },
        {
          "name": "policyEscrow",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "vaultId"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "reserve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vaultId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "maxBucketBps",
          "type": "u16"
        },
        {
          "name": "epochSeconds",
          "type": "i64"
        },
        {
          "name": "marginBps",
          "type": "u16"
        },
        {
          "name": "formulaVersion",
          "type": "u16"
        }
      ]
    },
    {
      "name": "issuePolicy",
      "discriminator": [
        126,
        159,
        34,
        92,
        118,
        55,
        15,
        196
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "assetMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "reserve",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "holderAssetAccount",
          "writable": true
        },
        {
          "name": "bucket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "arg",
                "path": "args.bucket_hash"
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "arg",
                "path": "args.predicate_hash"
              },
              {
                "kind": "arg",
                "path": "args.nonce"
              }
            ]
          }
        },
        {
          "name": "policyEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "issuePolicyArgs"
            }
          }
        }
      ]
    },
    {
      "name": "issuePolicyWithValidatedOdds",
      "discriminator": [
        33,
        2,
        223,
        63,
        69,
        23,
        49,
        44
      ],
      "accounts": [
        {
          "name": "holder",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "assetMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "reserve",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "holderAssetAccount",
          "writable": true
        },
        {
          "name": "bucket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "arg",
                "path": "args.bucket_hash"
              }
            ]
          }
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "holder"
              },
              {
                "kind": "arg",
                "path": "args.predicate_hash"
              },
              {
                "kind": "arg",
                "path": "args.nonce"
              }
            ]
          }
        },
        {
          "name": "policyEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        },
        {
          "name": "validatedOdds",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  101,
                  100,
                  95,
                  111,
                  100,
                  100,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "validated_odds.message_id_key",
                "account": "validatedOdds"
              }
            ]
          }
        },
        {
          "name": "validatedFixture",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  101,
                  100,
                  95,
                  102,
                  105,
                  120,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "validated_fixture.fixture_id",
                "account": "validatedFixture"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "issuePolicyArgs"
            }
          }
        }
      ]
    },
    {
      "name": "lpDeposit",
      "discriminator": [
        27,
        77,
        210,
        69,
        12,
        43,
        148,
        16
      ],
      "accounts": [
        {
          "name": "lp",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "assetMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "reserve",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "lpAssetAccount",
          "writable": true
        },
        {
          "name": "lpShareAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "assets",
          "type": "u64"
        }
      ]
    },
    {
      "name": "postAttestation",
      "discriminator": [
        12,
        75,
        255,
        83,
        59,
        171,
        141,
        27
      ],
      "accounts": [
        {
          "name": "attestor",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "attestation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  115,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "arg",
                "path": "args.seq"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "postAttestationArgs"
            }
          }
        }
      ]
    },
    {
      "name": "recordValidatedFixture",
      "discriminator": [
        170,
        76,
        149,
        162,
        154,
        85,
        174,
        52
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "validatedFixture",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  101,
                  100,
                  95,
                  102,
                  105,
                  120,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "fixtureId"
              }
            ]
          }
        },
        {
          "name": "txlineProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        },
        {
          "name": "tenDailyFixturesRoots"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fixtureId",
          "type": "u64"
        },
        {
          "name": "proof",
          "type": {
            "defined": {
              "name": "fixtureValidationInput"
            }
          }
        }
      ]
    },
    {
      "name": "recordValidatedOdds",
      "discriminator": [
        201,
        220,
        127,
        255,
        48,
        144,
        89,
        100
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "validatedOdds",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  108,
                  105,
                  100,
                  97,
                  116,
                  101,
                  100,
                  95,
                  111,
                  100,
                  100,
                  115
                ]
              },
              {
                "kind": "arg",
                "path": "messageIdKey"
              }
            ]
          }
        },
        {
          "name": "txlineProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        },
        {
          "name": "dailyOddsMerkleRoots"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "messageIdKey",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "proof",
          "type": {
            "defined": {
              "name": "oddsValidationInput"
            }
          }
        }
      ]
    },
    {
      "name": "requestWithdrawal",
      "discriminator": [
        251,
        85,
        121,
        205,
        56,
        201,
        12,
        177
      ],
      "accounts": [
        {
          "name": "lp",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "reserve",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "shareMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "lpShareAccount",
          "writable": true
        },
        {
          "name": "withdrawal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "lp"
              },
              {
                "kind": "arg",
                "path": "requestId"
              }
            ]
          }
        },
        {
          "name": "requestShareAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  116,
                  104,
                  100,
                  114,
                  97,
                  119,
                  97,
                  108,
                  95,
                  115,
                  104,
                  97,
                  114,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "withdrawal"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "requestId",
          "type": "u64"
        },
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settlePolicy",
      "discriminator": [
        180,
        234,
        21,
        174,
        50,
        214,
        91,
        113
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "bucket",
            "policy"
          ]
        },
        {
          "name": "assetMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "reserve",
          "writable": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "bucket",
          "writable": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true
        },
        {
          "name": "policyEscrow",
          "writable": true
        },
        {
          "name": "payoutAccount",
          "writable": true
        },
        {
          "name": "txlineProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        },
        {
          "name": "dailyScoresMerkleRoots"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "payload",
          "type": {
            "defined": {
              "name": "statValidationInput"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "exposureBucket",
      "discriminator": [
        210,
        25,
        219,
        87,
        97,
        4,
        244,
        65
      ]
    },
    {
      "name": "policy",
      "discriminator": [
        222,
        135,
        7,
        163,
        235,
        177,
        33,
        68
      ]
    },
    {
      "name": "solvencyAttestation",
      "discriminator": [
        42,
        23,
        198,
        111,
        115,
        158,
        250,
        61
      ]
    },
    {
      "name": "validatedFixture",
      "discriminator": [
        184,
        101,
        150,
        63,
        185,
        17,
        201,
        197
      ]
    },
    {
      "name": "validatedOdds",
      "discriminator": [
        193,
        26,
        68,
        95,
        250,
        130,
        40,
        76
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    },
    {
      "name": "withdrawalRequest",
      "discriminator": [
        242,
        88,
        147,
        173,
        182,
        62,
        229,
        193
      ]
    }
  ],
  "events": [
    {
      "name": "attestationPosted",
      "discriminator": [
        142,
        97,
        81,
        56,
        69,
        155,
        19,
        243
      ]
    },
    {
      "name": "fixtureValidated",
      "discriminator": [
        233,
        220,
        140,
        119,
        33,
        40,
        105,
        148
      ]
    },
    {
      "name": "lpDeposited",
      "discriminator": [
        85,
        211,
        184,
        159,
        176,
        224,
        28,
        72
      ]
    },
    {
      "name": "oddsValidated",
      "discriminator": [
        220,
        151,
        160,
        221,
        66,
        132,
        25,
        140
      ]
    },
    {
      "name": "policyExpired",
      "discriminator": [
        165,
        34,
        27,
        82,
        79,
        188,
        9,
        244
      ]
    },
    {
      "name": "policyIssued",
      "discriminator": [
        27,
        206,
        224,
        78,
        2,
        95,
        231,
        160
      ]
    },
    {
      "name": "policyIssuedWithValidatedOdds",
      "discriminator": [
        200,
        164,
        24,
        79,
        215,
        35,
        118,
        76
      ]
    },
    {
      "name": "policySettled",
      "discriminator": [
        67,
        45,
        149,
        235,
        199,
        184,
        83,
        77
      ]
    },
    {
      "name": "vaultInitialized",
      "discriminator": [
        180,
        43,
        207,
        2,
        18,
        71,
        3,
        75
      ]
    },
    {
      "name": "withdrawalExecuted",
      "discriminator": [
        37,
        78,
        199,
        192,
        51,
        68,
        173,
        162
      ]
    },
    {
      "name": "withdrawalRequested",
      "discriminator": [
        75,
        207,
        21,
        12,
        160,
        102,
        150,
        55
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "zeroAmount",
      "msg": "amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "zeroCoverage",
      "msg": "coverage must be greater than zero"
    },
    {
      "code": 6002,
      "name": "zeroPremium",
      "msg": "premium must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidBucketCap",
      "msg": "bucket cap must be between 1 and 10,000 basis points"
    },
    {
      "code": 6004,
      "name": "invalidEpoch",
      "msg": "withdrawal epoch must be greater than zero"
    },
    {
      "code": 6005,
      "name": "invalidMargin",
      "msg": "margin must be at least 10,000 basis points"
    },
    {
      "code": 6006,
      "name": "invalidFormulaVersion",
      "msg": "formula version must be non-zero"
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6008,
      "name": "mathUnderflow",
      "msg": "arithmetic underflow"
    },
    {
      "code": 6009,
      "name": "solvencyInvariantViolation",
      "msg": "vault accounting invariant failed"
    },
    {
      "code": 6010,
      "name": "reserveBalanceMismatch",
      "msg": "reserve token balance does not match free-reserve accounting"
    },
    {
      "code": 6011,
      "name": "depositTooSmall",
      "msg": "deposit is too small to mint one share"
    },
    {
      "code": 6012,
      "name": "withdrawalTooSmall",
      "msg": "withdrawal is too small to return one asset unit"
    },
    {
      "code": 6013,
      "name": "withdrawalNotPending",
      "msg": "withdrawal request is not pending"
    },
    {
      "code": 6014,
      "name": "epochNotReached",
      "msg": "withdrawal epoch has not been reached"
    },
    {
      "code": 6015,
      "name": "insufficientFreeReserves",
      "msg": "vault does not have enough free reserves"
    },
    {
      "code": 6016,
      "name": "emptyVault",
      "msg": "vault has no LP capital"
    },
    {
      "code": 6017,
      "name": "bucketCapExceeded",
      "msg": "outcome bucket cap would be exceeded"
    },
    {
      "code": 6018,
      "name": "invalidPredicate",
      "msg": "predicate encoding is empty or too long"
    },
    {
      "code": 6019,
      "name": "predicateHashMismatch",
      "msg": "predicate hash does not match canonical predicate bytes"
    },
    {
      "code": 6020,
      "name": "invalidExpiry",
      "msg": "policy expiry must be in the future"
    },
    {
      "code": 6021,
      "name": "policyNotOpen",
      "msg": "policy is not open"
    },
    {
      "code": 6022,
      "name": "policyNotExpired",
      "msg": "policy has not reached its expiry"
    },
    {
      "code": 6023,
      "name": "escrowBalanceMismatch",
      "msg": "policy escrow does not contain the full coverage amount"
    },
    {
      "code": 6024,
      "name": "invalidShareSupply",
      "msg": "share supply and capital state are inconsistent"
    },
    {
      "code": 6025,
      "name": "txlineProofTooLarge",
      "msg": "TxLINE proof contains too many nodes or stats"
    },
    {
      "code": 6026,
      "name": "invalidProofTimestamp",
      "msg": "TxLINE proof timestamp cannot derive a valid daily root"
    },
    {
      "code": 6027,
      "name": "invalidTxlineRoot",
      "msg": "TxLINE daily scores root is not the expected program-owned PDA"
    },
    {
      "code": 6028,
      "name": "txlineSerializationFailed",
      "msg": "failed to serialize the pinned TxLINE validation instruction"
    },
    {
      "code": 6029,
      "name": "missingTxlineReturnData",
      "msg": "TxLINE validation CPI returned no result"
    },
    {
      "code": 6030,
      "name": "invalidTxlineReturnProgram",
      "msg": "validation return data did not originate from TxLINE"
    },
    {
      "code": 6031,
      "name": "txlinePredicateRejected",
      "msg": "TxLINE rejected the policy predicate"
    },
    {
      "code": 6032,
      "name": "settlementPredicateMismatch",
      "msg": "settlement proof does not exactly match the policy predicate"
    },
    {
      "code": 6033,
      "name": "settlementNotFinal",
      "msg": "settlement requires TxLINE final-period statistics"
    },
    {
      "code": 6034,
      "name": "invalidAttestationSequence",
      "msg": "attestation sequence must extend the current vault head"
    },
    {
      "code": 6035,
      "name": "invalidAttestationPreviousHash",
      "msg": "attestation previous hash does not match the current vault head"
    },
    {
      "code": 6036,
      "name": "attestationBookMismatch",
      "msg": "attested reserves or locked collateral do not match the vault"
    },
    {
      "code": 6037,
      "name": "invalidSolvencyRatio",
      "msg": "attested solvency ratio does not match reserves and marked liabilities"
    },
    {
      "code": 6038,
      "name": "invalidAttestationHash",
      "msg": "attestation record hash does not match its canonical fields"
    },
    {
      "code": 6039,
      "name": "txlineOddsRejected",
      "msg": "TxLINE rejected the odds record or its Merkle proof"
    },
    {
      "code": 6040,
      "name": "invalidOddsMarket",
      "msg": "TxLINE odds record is not a supported full-match 1X2 market"
    },
    {
      "code": 6041,
      "name": "oddsPolicyMismatch",
      "msg": "TxLINE odds record does not match the policy fixture or outcome"
    },
    {
      "code": 6042,
      "name": "oddsMessageHashMismatch",
      "msg": "odds message ID does not match the receipt PDA hash"
    },
    {
      "code": 6043,
      "name": "staleOddsProof",
      "msg": "TxLINE odds proof is too old or dated too far in the future"
    },
    {
      "code": 6044,
      "name": "oddsPremiumMismatch",
      "msg": "policy premium does not match the on-chain calculation from validated odds"
    },
    {
      "code": 6045,
      "name": "verifiedQuoteHashMismatch",
      "msg": "quote hash does not commit to the validated TxLINE proof and policy terms"
    },
    {
      "code": 6046,
      "name": "validatedOddsRequired",
      "msg": "this vault requires TxLINE-validated odds issuance"
    },
    {
      "code": 6047,
      "name": "txlineFixtureRejected",
      "msg": "TxLINE rejected the fixture record or its Merkle proof"
    },
    {
      "code": 6048,
      "name": "invalidFixture",
      "msg": "TxLINE fixture record is malformed or unsupported"
    },
    {
      "code": 6049,
      "name": "fixtureIdMismatch",
      "msg": "TxLINE fixture identity does not match the expected fixture"
    },
    {
      "code": 6050,
      "name": "bucketHashMismatch",
      "msg": "bucket hash does not match the policy fixture and outcome"
    }
  ],
  "types": [
    {
      "name": "attestationPosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "attestation",
            "type": "pubkey"
          },
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "prevHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "recordHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reserves",
            "type": "u64"
          },
          {
            "name": "markedLiabilities",
            "type": "u64"
          },
          {
            "name": "solvencyRatioBps",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "exposureBucket",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "bucketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "lockedExposure",
            "type": "u64"
          },
          {
            "name": "openPolicyCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fixture",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "competition",
            "type": "string"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "fixtureGroupId",
            "type": "i32"
          },
          {
            "name": "participant1Id",
            "type": "i32"
          },
          {
            "name": "participant1",
            "type": "string"
          },
          {
            "name": "participant2Id",
            "type": "i32"
          },
          {
            "name": "participant2",
            "type": "string"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "participant1IsHome",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "fixtureBatchSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "competition",
            "type": "string"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "fixtureUpdateStats"
              }
            }
          },
          {
            "name": "updateSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "fixtureUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "u32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "fixtureValidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validatedFixture",
            "type": "pubkey"
          },
          {
            "name": "fixtureId",
            "type": "u64"
          },
          {
            "name": "snapshotTimestampMs",
            "type": "i64"
          },
          {
            "name": "startTimeMs",
            "type": "i64"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "participant1Id",
            "type": "i32"
          },
          {
            "name": "participant2Id",
            "type": "i32"
          },
          {
            "name": "participant1IsHome",
            "type": "bool"
          },
          {
            "name": "validationReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "fixtureValidationInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "snapshot",
            "type": {
              "defined": {
                "name": "fixture"
              }
            }
          },
          {
            "name": "summary",
            "type": {
              "defined": {
                "name": "fixtureBatchSummary"
              }
            }
          },
          {
            "name": "subTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "mainTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "issuePolicyArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "predicateLen",
            "type": "u8"
          },
          {
            "name": "predicateBytes",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "predicateHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "quoteHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bucketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "payoutAuthority",
            "type": "pubkey"
          },
          {
            "name": "coverage",
            "type": "u64"
          },
          {
            "name": "premium",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "lpDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "lp",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "odds",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "messageId",
            "type": "string"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "bookmaker",
            "type": "string"
          },
          {
            "name": "bookmakerId",
            "type": "i32"
          },
          {
            "name": "superOddsType",
            "type": "string"
          },
          {
            "name": "gameState",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "inRunning",
            "type": "bool"
          },
          {
            "name": "marketParameters",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "marketPeriod",
            "type": {
              "option": "string"
            }
          },
          {
            "name": "priceNames",
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "prices",
            "type": {
              "vec": "i32"
            }
          }
        ]
      }
    },
    {
      "name": "oddsBatchSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "oddsUpdateStats"
              }
            }
          },
          {
            "name": "oddsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "oddsUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "i32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "oddsValidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "validatedOdds",
            "type": "pubkey"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "oddsTimestampMs",
            "type": "i64"
          },
          {
            "name": "messageIdHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "validationReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "prices",
            "type": {
              "array": [
                "i32",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "oddsValidationInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oddsSnapshot",
            "type": {
              "defined": {
                "name": "odds"
              }
            }
          },
          {
            "name": "summary",
            "type": {
              "defined": {
                "name": "oddsBatchSummary"
              }
            }
          },
          {
            "name": "subTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "mainTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "policy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "policyStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "predicateLen",
            "type": "u8"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "payoutAuthority",
            "type": "pubkey"
          },
          {
            "name": "bucket",
            "type": "pubkey"
          },
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "predicateHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "quoteHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bucketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "merkleReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "predicateBytes",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "coverage",
            "type": "u64"
          },
          {
            "name": "premium",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "policyExpired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "caller",
            "type": "pubkey"
          },
          {
            "name": "coverage",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "policyIssued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "coverage",
            "type": "u64"
          },
          {
            "name": "premium",
            "type": "u64"
          },
          {
            "name": "predicateHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "quoteHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bucketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "policyIssuedWithValidatedOdds",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "validatedFixture",
            "type": "pubkey"
          },
          {
            "name": "validatedOdds",
            "type": "pubkey"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "oddsTimestampMs",
            "type": "i64"
          },
          {
            "name": "messageIdHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "validationReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "probabilityPpm",
            "type": "u32"
          },
          {
            "name": "premium",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "policySettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "caller",
            "type": "pubkey"
          },
          {
            "name": "payoutAuthority",
            "type": "pubkey"
          },
          {
            "name": "coverage",
            "type": "u64"
          },
          {
            "name": "merkleReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "policyStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "triggered"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "postAttestationArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "prevHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "recordHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oddsPacketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bookSnapshotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reserves",
            "type": "u64"
          },
          {
            "name": "lockedCollateral",
            "type": "u64"
          },
          {
            "name": "markedLiabilities",
            "type": "u64"
          },
          {
            "name": "solvencyRatioBps",
            "type": "u64"
          },
          {
            "name": "observedAtMs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "proofNode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isRightSibling",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "scoreStat",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "u32"
          },
          {
            "name": "value",
            "type": "i32"
          },
          {
            "name": "period",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "scoresBatchSummary",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "scoresUpdateStats"
              }
            }
          },
          {
            "name": "eventsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "scoresUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "i32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "solvencyAttestation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "prevHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "recordHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oddsPacketHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bookSnapshotHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reserves",
            "type": "u64"
          },
          {
            "name": "lockedCollateral",
            "type": "u64"
          },
          {
            "name": "markedLiabilities",
            "type": "u64"
          },
          {
            "name": "solvencyRatioBps",
            "type": "u64"
          },
          {
            "name": "observedAtMs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "statLeaf",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stat",
            "type": {
              "defined": {
                "name": "scoreStat"
              }
            }
          },
          {
            "name": "statProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "statValidationInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "fixtureSummary",
            "type": {
              "defined": {
                "name": "scoresBatchSummary"
              }
            }
          },
          {
            "name": "fixtureProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "mainTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "eventStatRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "stats",
            "type": {
              "vec": {
                "defined": {
                  "name": "statLeaf"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "validatedFixture",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "participant1IsHome",
            "type": "bool"
          },
          {
            "name": "fixtureId",
            "type": "u64"
          },
          {
            "name": "snapshotTimestampMs",
            "type": "i64"
          },
          {
            "name": "startTimeMs",
            "type": "i64"
          },
          {
            "name": "competitionId",
            "type": "i32"
          },
          {
            "name": "participant1Id",
            "type": "i32"
          },
          {
            "name": "participant2Id",
            "type": "i32"
          },
          {
            "name": "validationReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "validatedOdds",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "oddsTimestampMs",
            "type": "i64"
          },
          {
            "name": "messageIdKey",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "messageIdHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "validationReceiptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "prices",
            "type": {
              "array": [
                "i32",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "assetDecimals",
            "type": "u8"
          },
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "reserve",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "totalCapital",
            "type": "u64"
          },
          {
            "name": "freeReserves",
            "type": "u64"
          },
          {
            "name": "lockedLiabilities",
            "type": "u64"
          },
          {
            "name": "maxBucketBps",
            "type": "u16"
          },
          {
            "name": "epochSeconds",
            "type": "i64"
          },
          {
            "name": "policyCount",
            "type": "u64"
          },
          {
            "name": "attestationSeq",
            "type": "u64"
          },
          {
            "name": "latestAttestationHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "marginBps",
            "type": "u16"
          },
          {
            "name": "formulaVersion",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vaultInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "assetMint",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "maxBucketBps",
            "type": "u16"
          },
          {
            "name": "epochSeconds",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "withdrawalExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "lp",
            "type": "pubkey"
          },
          {
            "name": "request",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "withdrawalRequest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "lp",
            "type": "pubkey"
          },
          {
            "name": "shareAccount",
            "type": "pubkey"
          },
          {
            "name": "requestId",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "withdrawalStatus"
              }
            }
          }
        ]
      }
    },
    {
      "name": "withdrawalRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "lp",
            "type": "pubkey"
          },
          {
            "name": "request",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "unlockTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "withdrawalStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "executed"
          }
        ]
      }
    }
  ]
};
