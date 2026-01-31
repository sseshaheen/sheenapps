'use client'

import { PortableText as BasePortableText } from '@portabletext/react'
import Image from 'next/image'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from 'next-themes'
import { urlFor } from '@/lib/sanity.client'

// Custom components for PortableText rendering
const components = {
  types: {
    image: ({ value }: any) => (
      <div className="my-8">
        <Image
          src={urlFor(value).width(800).height(400).url()}
          alt={value.alt || 'Blog image'}
          width={800}
          height={400}
          className="rounded-lg object-cover"
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
        />
        {value.caption && (
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {value.caption}
          </p>
        )}
      </div>
    ),
    code: ({ value }: any) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { theme } = useTheme()
      const codeStyle = theme === 'dark' ? vscDarkPlus : vs
      const language = value.language || 'text'
      
      return (
        <div className="my-6 not-prose">
          {value.filename && (
            <div className="bg-muted px-4 py-2 text-sm font-mono text-muted-foreground border-b border-border rounded-t-lg">
              📄 {value.filename}
            </div>
          )}
          <div className={`${value.filename ? 'rounded-t-none' : ''} rounded-lg overflow-hidden`}>
            <SyntaxHighlighter
              language={language}
              style={codeStyle}
              customStyle={{
                margin: 0,
                borderRadius: value.filename ? '0 0 0.5rem 0.5rem' : '0.5rem',
                fontSize: '0.875rem',
                lineHeight: '1.5'
              }}
              showLineNumbers={language !== 'text' && value.code && value.code.split('\n').length > 5}
              wrapLines={true}
              wrapLongLines={true}
            >
              {value.code}
            </SyntaxHighlighter>
          </div>
        </div>
      )
    },
  },
  marks: {
    link: ({ children, value }: any) => {
      const target = value?.blank ? '_blank' : undefined
      return (
        <a
          href={value?.href}
          target={target}
          rel={target === '_blank' ? 'noopener noreferrer' : undefined}
          className="text-primary hover:underline"
        >
          {children}
        </a>
      )
    },
    code: ({ children }: any) => (
      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic">{children}</em>
    ),
  },
  block: {
    // Normal paragraph
    normal: ({ children }: any) => (
      <p className="mb-4 leading-7">{children}</p>
    ),
    // Headings
    h1: ({ children }: any) => (
      <h1 className="text-3xl font-bold mb-6 mt-8 first:mt-0">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-2xl font-semibold mb-4 mt-8">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-xl font-semibold mb-3 mt-6">{children}</h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="text-lg font-semibold mb-2 mt-4">{children}</h4>
    ),
    // Blockquote
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-muted-foreground/30 pl-4 my-6 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }: any) => (
      <ul className="list-disc ml-6 mb-4 space-y-1">{children}</ul>
    ),
    number: ({ children }: any) => (
      <ol className="list-decimal ml-6 mb-4 space-y-1">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }: any) => <li>{children}</li>,
    number: ({ children }: any) => <li>{children}</li>,
  },
}

interface PortableTextProps {
  value: any[]
  className?: string
}

export function PortableText({ value, className = '' }: PortableTextProps) {
  return (
    <div className={`prose prose-lg dark:prose-invert max-w-none ${className}`}>
      <BasePortableText value={value} components={components} />
    </div>
  )
}